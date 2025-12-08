require('dotenv').config();
// Backend Express que serve a UI e a API de questões/provas.
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS_PATH = path.join(__dirname, 'uploads');
const EXAMS_PATH = path.join(__dirname, 'exams');
const EXAMS_DB_PATH = path.join(__dirname, 'exams.json');
const PROMPT_PATH = path.join(__dirname, 'prompt.txt');
const EXAMS_DATA_PATH = path.join(__dirname, 'exams-data');
const SUBJECTS_PATH = path.join(__dirname, 'subjects');
const CREATE_PASSWORD = process.env.CREATE_PASSWORD || '';
// Mapeia variações de nível para um padrão (Não tenho ideia como ta funcionandoKKK).
const LEVEL_NORMALIZE_MAP = {
    medio: 'medio',
    basico: 'basico',
    avancado: 'avancado'
};
const DELETE_PASSWORD = process.env.DELETE_PASSWORD || '';

// Middlewares e estáticos
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(UPLOADS_PATH));
app.use('/exams', express.static(EXAMS_PATH));
app.use('/exams-data', express.static(EXAMS_DATA_PATH));
app.use('/subjects', express.static(SUBJECTS_PATH));

// Upload config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(UPLOADS_PATH, { recursive: true });
        cb(null, UPLOADS_PATH);
    },
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/\s+/g, '_');
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`);
    }
});
const upload = multer({ storage });

// Upload para provas
const examStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(EXAMS_PATH, { recursive: true });
        cb(null, EXAMS_PATH);
    },
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/\s+/g, '_');
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`);
    }
});
const examUpload = multer({ storage: examStorage });

// Helpers de leitura/escrita em disco
function readDatabase() {
    const base = {};
    if (fs.existsSync(SUBJECTS_PATH)) {
        const files = fs.readdirSync(SUBJECTS_PATH).filter(f => f.endsWith('.json'));
        files.forEach(file => {
            try {
                const raw = fs.readFileSync(path.join(SUBJECTS_PATH, file), 'utf8');
                const parsed = JSON.parse(raw);
                const subject = parsed.subject || path.basename(file, '.json');
                const questions = Array.isArray(parsed) ? parsed : parsed.questions;
                if (Array.isArray(questions)) base[subject] = questions;
            } catch (err) {
                console.error('Erro ao ler subject file', file, err);
            }
        });
    }
    return base;
}

function writeDatabase(db) {
    // Persistência por matéria em /subjects.
    Object.entries(db || {}).forEach(([subject, questions]) => {
        writeSubjectFile(subject, Array.isArray(questions) ? questions : []);
    });
}

function ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
        } catch {
            return [value];
        }
    }
    return [];
}

function mapWithId(subject, questions) {
    return questions.map((q, index) => ({
        id: q.id || `${subject}-${index}`,
        ...q
    }));
}

function generateId() {
    // Gera um ID curto para questões/provas.
    return `q-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function normalizeLabel(text) {
    // Normaliza para comparação sem acentos.
    return (text || '')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function normalizeLevel(level) {
    // Aplica mapa de nível e fallback.
    if (!level) return '';
    const lowered = normalizeLabel(level);
    if (LEVEL_NORMALIZE_MAP[lowered]) return LEVEL_NORMALIZE_MAP[lowered];
    return lowered;
}

function slugify(text) {
    return (text || 'materia')
        .toString()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'materia';
}

function writeSubjectFile(subject, questions) {
    fs.mkdirSync(SUBJECTS_PATH, { recursive: true });
    const filename = `${slugify(subject)}.json`;
    const payload = {
        subject,
        questions
    };
    fs.writeFileSync(path.join(SUBJECTS_PATH, filename), JSON.stringify(payload, null, 2), 'utf8');
    return filename;
}

function readExams() {
    if (!fs.existsSync(EXAMS_DB_PATH)) {
        fs.writeFileSync(EXAMS_DB_PATH, JSON.stringify([], null, 2), 'utf8');
    }
    const data = fs.readFileSync(EXAMS_DB_PATH, 'utf8');
    return JSON.parse(data);
}

function writeExams(exams) {
    fs.writeFileSync(EXAMS_DB_PATH, JSON.stringify(exams, null, 2), 'utf8');
}

function listSubjectEntries() {
    const database = readDatabase();
    return Object.keys(database)
        .filter(key => Array.isArray(database[key]) && database[key].length > 0)
        .map(subject => ({
            id: `subject-${slugify(subject)}`,
            subject,
            level: '',
            importedQuestions: database[subject].length,
            uploadedAt: null,
            virtual: true
        }));
}

function readPrompt() {
    // Guarda o prompt customizado usado pela tela de configurações.
    if (!fs.existsSync(PROMPT_PATH)) return '';
    return fs.readFileSync(PROMPT_PATH, 'utf8');
}

function writePrompt(promptText) {
    fs.writeFileSync(PROMPT_PATH, promptText || '', 'utf8');
}

// Parser de provas em texto (.txt) no formato:
// Materia: <nome>
// Nivel: <basico|medio|avancado>
// Q1:
// Enunciado: ...
// A) ...
// B) ...
// C) ...
// D) ...
// Resposta: C
// Explicacoes:
// A) ...
// B) ...
// C) ...
// D) ...
// (repete para Q2, Q3..., separados por linha em branco)
function parseTxtExam(rawText, fallbackSubject, fallbackLevel = 'medio') {
    // Converte texto em perguntas estruturadas (Não tenho ideia como ta funcionandoKKK).
    const lines = rawText.split(/\r?\n/);
    let subject = fallbackSubject;
    let level = fallbackLevel;
    const segments = [];
    let current = [];

    // Le cabecalho e separa blocos por Q\d+:
    lines.forEach(line => {
        const trimmed = line.trim();
        const norm = normalizeLabel(trimmed);
        if (norm.startsWith('materia:')) {
            subject = trimmed.split(':')[1]?.trim() || subject;
            return;
        }
        if (norm.startsWith('nivel:') || norm.startsWith('nivel da prova:')) {
            level = normalizeLevel(trimmed.split(':')[1] || level) || level;
            return;
        }
        if (/^q\d+:/i.test(trimmed)) {
            if (current.length) segments.push(current.join('\n'));
            current = [trimmed];
        } else {
            current.push(line);
        }
    });
    if (current.length) segments.push(current.join('\n'));

    const questions = [];
    segments.forEach(seg => {
        const segLines = seg.split(/\r?\n/);
        let questionText = '';
        let theme = '';
        let questionLevel = '';
        const options = [];
        const optionExplanations = [];
        let answerIndex = -1;
        let inExplanation = false;

        segLines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const norm = normalizeLabel(trimmed);
            if (norm.startsWith('enunciado:')) {
                questionText = trimmed.replace(/enunciado:\s*/i, '');
                return;
            }
            if (norm.startsWith('nivel da questao:') || norm.startsWith('nivel da questao da pergunta:')) {
                questionLevel = trimmed.split(':')[1]?.trim() || '';
                return;
            }
            if (norm.startsWith('tema:')) {
                theme = trimmed.replace(/tema:\s*/i, '');
                return;
            }
            const optMatch = trimmed.match(/^([A-D])\)\s*(.+)/i);
            if (optMatch && !inExplanation) {
                const idx = optMatch[1].toUpperCase().charCodeAt(0) - 65;
                options[idx] = optMatch[2].trim();
                return;
            }
            if (norm.startsWith('resposta:')) {
                const letter = trimmed.split(':')[1]?.trim().toUpperCase();
                if (letter && letter.length) answerIndex = letter.charCodeAt(0) - 65;
                return;
            }
            if (norm.startsWith('explica')) {
                inExplanation = true;
                return;
            }
            const expMatch = trimmed.match(/^([A-D])\)\s*(.+)/i);
            if (expMatch && inExplanation) {
                const idx = expMatch[1].toUpperCase().charCodeAt(0) - 65;
                optionExplanations[idx] = expMatch[2].trim();
            }
        });

        if (questionText && options.length) {
            questions.push({
                id: generateId(),
                question: questionText,
                theme,
                options,
                optionExplanations,
                answer: answerIndex >= 0 ? answerIndex : 0,
                level: normalizeLevel(questionLevel || level)
            });
        }
    });

    return {
        subject: subject || fallbackSubject || 'Sem materia',
        level,
        questions
    };
}

// Rota da API para obter a lista de matÃ©rias
app.get('/api/subjects', (req, res) => {
    try {
        const database = readDatabase();
        const subjects = Object.keys(database).filter(key => Array.isArray(database[key]) && database[key].length > 0);
        res.json(subjects);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao ler o banco de dados.');
    }
});

// Rota da API para obter as perguntas de uma matÃ©ria especÃ­fica
app.get('/api/questions/:subject', (req, res) => {
    const subject = req.params.subject;
    try {
        const database = readDatabase();
        if (database[subject]) {
            res.json(mapWithId(subject, database[subject]));
        } else {
            res.status(404).send('MatÃ©ria nÃ£o encontrada.');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao ler o banco de dados.');
    }
});

// Criação de perguntas com anexos
app.post('/api/questions', upload.array('attachments', 10), (req, res) => {
    try {
        const { subject, question, answer, level = 'medio' } = req.body;
        const createPassword = req.body.createPassword || req.headers['x-create-secret'] || '';
        const requiredPass = CREATE_PASSWORD || DELETE_PASSWORD;
        if (requiredPass && createPassword !== requiredPass) {
            return res.status(403).json({ message: 'Senha invalida.' });
        }
        const options = ensureArray(req.body.options);
        const optionExplanations = ensureArray(req.body.optionExplanations);

        if (!subject || !question || !options.length) {
            return res.status(400).json({ message: 'Subject, question e options sao obrigatorios.' });
        }
        if (Number.isNaN(parseInt(answer, 10)) || parseInt(answer, 10) < 0 || parseInt(answer, 10) >= options.length) {
            return res.status(400).json({ message: 'Answer invalido.' });
        }

        const attachments = (req.files || []).map(file => ({
            originalName: file.originalname,
            path: /uploads/
        }));

        const newQuestion = {
            id: generateId(),
            question,
            options,
            optionExplanations,
            answer: parseInt(answer, 10),
            level,
            attachments
        };

        const database = readDatabase();
        if (!database[subject]) database[subject] = [];
        database[subject].push(newQuestion);
        writeDatabase(database);
        writeSubjectFile(subject, database[subject]);

        res.status(201).json(newQuestion);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao salvar a pergunta.' });
    }
});

// Criar perguntas em lote a partir do texto do prompt
app.post('/api/questions/bulk', (req, res) => {
    try {
        const { rawText = '', subject: subjectInput, level = 'medio', password = '' } = req.body || {};
        const requiredPass = CREATE_PASSWORD || DELETE_PASSWORD;
        if (requiredPass && password !== requiredPass) {
            return res.status(403).json({ message: 'Senha invalida.' });
        }
        if (!rawText.trim()) return res.status(400).json({ message: 'Cole as questoes no formato do prompt.' });
        const parsed = parseTxtExam(rawText, subjectInput, level);
        const finalSubject = parsed.subject || subjectInput;
        const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
        if (!finalSubject) return res.status(400).json({ message: 'Informe a materia.' });
        if (!questions.length) return res.status(400).json({ message: 'Nenhuma questao encontrada no texto enviado.' });

        const database = readDatabase();
        if (!database[finalSubject]) database[finalSubject] = [];
        const sanitized = questions.map(q => ({ ...q, id: q.id || generateId() }));
        database[finalSubject].push(...sanitized);
        writeDatabase(database);
        writeSubjectFile(finalSubject, database[finalSubject]);

        res.json({ imported: sanitized.length, subject: finalSubject, level: parsed.level || level });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao salvar questoes.' });
    }
});
// Mock de geração via "IA" (placeholder)
app.post('/api/generate-questions', (req, res) => {
    try {
        const { subject, level = 'mÃ©dio', wrongQuestions = [] } = req.body;
        const base = Array.isArray(wrongQuestions) && wrongQuestions.length ? wrongQuestions : [{ question: 'Sem erros enviados', answer: -1 }];
        const generated = base.slice(0, 3).map((q, idx) => ({
            id: generateId(),
            question: `Nova questÃ£o (nÃ­vel ${level}) inspirada em: ${q.question || 'questÃ£o anterior'}`,
            options: ['OpÃ§Ã£o A', 'OpÃ§Ã£o B', 'OpÃ§Ã£o C', 'OpÃ§Ã£o D'],
            optionExplanations: [
                'ExplicaÃ§Ã£o da opÃ§Ã£o A',
                'ExplicaÃ§Ã£o da opÃ§Ã£o B',
                'ExplicaÃ§Ã£o da opÃ§Ã£o C',
                'ExplicaÃ§Ã£o da opÃ§Ã£o D'
            ],
            answer: 0,
            level,
            generatedFrom: q.id || `seed-${idx}`,
            subject
        }));
        res.json(generated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao gerar questÃµes.' });
    }
});

// Registrar nova prova (arquivo txt/csv)
app.post('/api/exams', examUpload.single('examFile'), (req, res) => {
    try {
        const { subject: subjectInput, level = 'mÃ©dio', format = 'txt' } = req.body;
        if (!req.file) {
            return res.status(400).json({ message: 'Envie o arquivo ou texto da prova (txt ou csv).' });
        }
        const exams = readExams();
        fs.mkdirSync(EXAMS_DATA_PATH, { recursive: true });
        const newExam = {
            id: generateId(),
            subject: subjectInput,
            level,
            format,
            originalName: req.file.originalname,
            storedName: req.file.filename,
            path: `/exams/${req.file.filename}`,
            uploadedAt: new Date().toISOString()
        };
        exams.push(newExam);
        writeExams(exams);

        // Armazena metadados e conteÃºdo bruto em um arquivo dedicado por prova
        try {
            const rawText = fs.readFileSync(req.file.path, 'utf8');
            const examJsonPath = path.join(EXAMS_DATA_PATH, `${newExam.id}.json`);
            fs.writeFileSync(examJsonPath, JSON.stringify({
                ...newExam,
                rawText
            }, null, 2), 'utf8');
            newExam.jsonPath = `/exams-data/${newExam.id}.json`;
            // Se for txt, tenta converter para questÃµes e salvar
            if (format === 'txt') {
                const { subject: parsedSubject, level: parsedLevel, questions } = parseTxtExam(rawText, subjectInput, level);
                const finalSubject = parsedSubject || subjectInput;
                if (!finalSubject) {
                    return res.status(400).json({ message: 'NÃ£o foi possÃ­vel identificar a matÃ©ria no arquivo.' });
                }
                if (questions.length) {
                    const database = readDatabase();
                    if (!database[finalSubject]) database[finalSubject] = [];
                    database[finalSubject].push(...questions);
                    writeDatabase(database);
                    writeSubjectFile(finalSubject, database[finalSubject]);
                    newExam.importedQuestions = questions.length;
                    newExam.subject = finalSubject;
                    newExam.level = parsedLevel || level;
                }
            }
        } catch (err) {
            console.error('Falha ao salvar JSON da prova:', err);
        }

        res.status(201).json(newExam);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao salvar a prova.' });
    }
});

// Listar provas
app.get('/api/exams', (req, res) => {
    try {
        const exams = readExams();
        const virtualSubjects = listSubjectEntries().filter(v => !exams.some(e => e.subject === v.subject));
        res.json([...exams, ...virtualSubjects]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao ler provas.' });
    }
});

// Remover prova
app.delete('/api/exams/:id', (req, res) => {
    const examId = req.params.id;
    const { password } = req.body;
    if (password !== DELETE_PASSWORD) return res.status(403).json({ message: 'Senha incorreta.' });
    try {
        if (examId.startsWith('subject-')) {
            const subjectsEntries = listSubjectEntries();
            const entry = subjectsEntries.find(e => e.id === examId);
            if (!entry) return res.status(404).json({ message: 'Prova não encontrada.' });
            const database = readDatabase();
            delete database[entry.subject];
            writeDatabase(database);
            const filePath = path.join(SUBJECTS_PATH, `${slugify(entry.subject)}.json`);
            if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (err) { console.error('Erro ao remover arquivo de materia', err); } }
            return res.json({ message: 'Prova removida.' });
        }
        const exams = readExams();
        const index = exams.findIndex(e => e.id === examId);
        if (index === -1) return res.status(404).json({ message: 'Prova não encontrada.' });
        const [removed] = exams.splice(index, 1);
        writeExams(exams);
        if (removed.storedName) {
            const filePath = path.join(EXAMS_PATH, removed.storedName);
            if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (err) { console.error('Erro ao remover arquivo de prova', err); } }
        }
        if (removed.id) {
            const dataPath = path.join(EXAMS_DATA_PATH, `${removed.id}.json`);
            if (fs.existsSync(dataPath)) { try { fs.unlinkSync(dataPath); } catch (err) { console.error('Erro ao remover JSON da prova', err); } }
        }
        res.json({ message: 'Prova removida.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao remover prova.' });
    }
});

// Prompt para geração de provas
app.get('/api/prompt', (req, res) => {
    try {
        const prompt = readPrompt();
        res.json({ prompt });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao ler prompt.' });
    }
});

app.post('/api/prompt', (req, res) => {
    try {
        const { prompt = '' } = req.body;
        writePrompt(prompt);
        res.json({ prompt });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Erro ao salvar prompt.' });
    }
});

// Exportar questÃµes para .txt
app.get('/api/export/:subject', (req, res) => {
    try {
        const subject = req.params.subject;
        const database = readDatabase();
        if (!database[subject] || !database[subject].length) {
            return res.status(404).send('MatÃ©ria nÃ£o encontrada ou sem questÃµes.');
        }
        const questions = mapWithId(subject, database[subject]);
        const lines = [];
        questions.forEach((q, idx) => {
            lines.push(`Q${idx + 1}: ${q.question}`);
            (q.options || []).forEach((opt, i) => {
                const letter = String.fromCharCode(65 + i);
                lines.push(`  ${letter}) ${opt}`);
            });
            lines.push(`Resposta: ${String.fromCharCode(65 + (q.answer || 0))}`);
            if (q.optionExplanations && q.optionExplanations.length) {
                lines.push('ExplicaÃ§Ãµes:');
                q.optionExplanations.forEach((exp, i) => {
                    const letter = String.fromCharCode(65 + i);
                    lines.push(`  ${letter}) ${exp || 'Sem explicaÃ§Ã£o'}`);
                });
            }
            lines.push('');
        });
        const content = lines.join('\n');
        res.setHeader('Content-Disposition', `attachment; filename="${subject.replace(/\s+/g, '_')}.txt"`);
        res.type('text/plain').send(content);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao exportar questÃµes.');
    }
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});










