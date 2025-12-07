// Super Simulado - frontend logic (clean ASCII)\n// Fluxo: navegação de telas, montagem de quiz, criação/importação e ajustes de tema.

(function(){
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        // Elementos principais / telas
        const startScreenEl = get('startScreen');
        const createScreenEl = get('createScreen');
        const addExamScreenEl = get('addExamScreen');
        const manageExamsScreenEl = get('manageExamsScreen');
        const settingsScreenEl = get('settingsScreen');
        const promptScreenEl = get('promptScreen');
        const quizAreaEl = get('quizArea');
        const loadingMessageEl = get('loading-message');
        const quizSubjectTitleEl = get('quiz-subject-title');
        const quizFormEl = get('quizForm');
        const timerElementEl = get('timer');
        const submitButtonEl = get('submitButton');
        const resultsContainerEl = get('results');
        const scoreElementEl = get('score');
        const overallFeedbackElementEl = get('overallFeedback');
        const retryButtonEl = get('retryButton');
        const retryWrongButtonEl = get('retryWrongButton');
        const generateAiButtonEl = get('generateAiButton');

        // Navegacao
        const logoHomeEl = get('logoHome');
        const goToStartEl = get('goToStart');
        const goToAddExamEl = get('goToAddExam');
        const goToCreateEl = get('goToCreate');
        const goToSettingsEl = get('goToSettings');
        const goToManageExamsEl = get('goToManageExams');

        // Filtros iniciais
        const filterSubjectSelectEl = get('filterSubjectSelect');
        const filterQuantityEl = get('filterQuantity');
        const filterLevelEl = get('filterLevel');
        const startFilteredButtonEl = get('startFilteredButton');
        const exportTxtButtonEl = get('exportTxtButton');

        // Insights
        const insightSubjectSelectEl = get('insightSubjectSelect');
        const insightChartEl = get('insightChart');

        // Criar pergunta
        const createFormEl = get('createQuestionForm');
        const subjectSelectEl = get('subjectSelect');
        const newSubjectEl = get('newSubject');
        const levelSelectEl = get('level');
        const questionTextEl = get('questionText');
        const optionsContainerEl = get('optionsContainer');
        const addOptionButtonEl = get('addOptionButton');
        const attachmentsEl = get('attachments');
        const createStatusEl = get('createStatus');

        // Adicionar prova
        const addExamFormEl = get('addExamForm');
        const examFormatEl = get('examFormat');
        const examFileEl = get('examFile');
        const examTextEl = get('examText');
        const addExamStatusEl = get('addExamStatus');

        // Gerenciar simulados
        const managePasswordEl = get('managePassword');
        const manageExamsListEl = get('manageExamsList');
        const reloadExamsEl = get('reloadExams');

        // Prompt
        const promptFormEl = get('promptForm');
        const promptTemplateEl = get('promptTemplate');
        const promptStatusEl = get('promptStatus');
        const openPromptScreenEl = get('openPromptScreen');
        const backFromPromptEl = get('backFromPrompt');

        // Tema
        const toggleThemeEl = get('toggleTheme');
        const toggleThemeQuickEl = get('toggleThemeQuick');

        // Sidebar
        const sidebarToggleEl = get('sidebarToggle');
        const bodyEl = document.body;

        // Modal confirmacao
        const confirmOverlayEl = get('confirmOverlay');
        const confirmStayEl = get('confirmStay');
        const confirmLeaveEl = get('confirmLeave');

        // Estado
        let currentQuizData = [];
        let wrongQuestions = [];
        let timeLeft;
        let timerInterval;
        let quizSubmitted = false;
        let currentSubject = '';
        let pendingLeaveAction = null;
        let currentTheme = localStorage.getItem('theme') || 'light';
        const subjectQuestionsCache = {};
        let isSidebarCollapsed = false;

        const normalizeLevel = (val) => (val || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const formatTime = (num) => (num < 10 ? '0' + num : String(num));
        const shuffleArray = (array) => { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } };

        function applyTheme(theme) {
            // Alterna tema claro/escuro e salva no localStorage.
            currentTheme = theme;
            bodyEl.classList.remove('dark-mode', 'light-mode');
            bodyEl.classList.add(theme === 'dark' ? 'dark-mode' : 'light-mode');
            localStorage.setItem('theme', theme);
        }
        const toggleTheme = () => applyTheme(currentTheme === 'dark' ? 'light' : 'dark');

        function updateSidebarToggleIcon() {
            if (!sidebarToggleEl) return;
            const icon = sidebarToggleEl.querySelector('.toggle-icon');
            if (icon) icon.textContent = isSidebarCollapsed ? '<<' : '>>';
        }
        function setSidebarCollapsed(collapsed) {
            // Esconde/mostra sidebar durante prova para foco.
            isSidebarCollapsed = collapsed;
            if (collapsed) bodyEl.classList.add('sidebar-collapsed');
            else bodyEl.classList.remove('sidebar-collapsed');
            updateSidebarToggleIcon();
        }
        const toggleSidebar = () => setSidebarCollapsed(!isSidebarCollapsed);

        function showScreen(target) {
            // Liga/desliga seções conforme navegação.
            setDisplay(startScreenEl, target === 'start');
            setDisplay(quizAreaEl, target === 'quiz');
            setDisplay(createScreenEl, target === 'create');
            setDisplay(addExamScreenEl, target === 'addExam');
            setDisplay(manageExamsScreenEl, target === 'manageExams');
            setDisplay(settingsScreenEl, target === 'settings');
            setDisplay(promptScreenEl, target === 'prompt');
            setSidebarCollapsed(target === 'quiz');
        }

        function safeNavigate(target) {
            // Confirma saída se estiver no meio da prova.
            const quizActive = quizAreaEl && quizAreaEl.style.display === 'block' && !quizSubmitted;
            if (!quizActive) {
                showScreen(target);
                return;
            }
            pendingLeaveAction = () => showScreen(target);
            setDisplay(confirmOverlayEl, true);
        }

        confirmStayEl?.addEventListener('click', () => {
            setDisplay(confirmOverlayEl, false);
            pendingLeaveAction = null;
        });
        confirmLeaveEl?.addEventListener('click', () => {
            setDisplay(confirmOverlayEl, false);
            if (typeof pendingLeaveAction === 'function') pendingLeaveAction();
            pendingLeaveAction = null;
        });

        // ---------------------- Carregamento ----------------------
        async function fetchSubjects() {
            try {
                const res = await fetch('/api/subjects');
                const data = await res.json();
                return Array.isArray(data) ? data : [];
            } catch (err) {
                console.error('Erro ao carregar materias', err);
                return [];
            }
        }

        async function fetchSubjectQuestions(subject) {
            if (!subject) return [];
            if (subjectQuestionsCache[subject]) return subjectQuestionsCache[subject];
            try {
                const res = await fetch(`/api/questions/${encodeURIComponent(subject)}`);
                if (!res.ok) throw new Error('Falha ao buscar questoes');
                const data = await res.json();
                subjectQuestionsCache[subject] = Array.isArray(data) ? data : [];
                return subjectQuestionsCache[subject];
            } catch (err) {
                console.error('Erro ao carregar questoes', err);
                return [];
            }
        }

        async function loadSubjects() {
            // Popula selects com matérias disponíveis.
            if (loadingMessageEl) loadingMessageEl.textContent = 'Carregando materias...';
            const subjects = await fetchSubjects();
            if (loadingMessageEl) loadingMessageEl.textContent = subjects.length ? '' : 'Nenhuma materia encontrada.';
            const selects = [filterSubjectSelectEl, subjectSelectEl, insightSubjectSelectEl];
            selects.forEach(sel => {
                if (!sel) return;
                sel.innerHTML = '';
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.textContent = 'Selecione uma materia';
                sel.appendChild(placeholder);
                subjects.forEach(sub => {
                    const opt = document.createElement('option');
                    opt.value = sub;
                    opt.textContent = sub;
                    sel.appendChild(opt);
                });
            });
        }

        // ---------------------- Quantidade ----------------------
        async function updateQuantityOptions() {
            const subject = filterSubjectSelectEl?.value || '';
            const level = normalizeLevel(filterLevelEl?.value || '');
            if (!filterQuantityEl) return;
            filterQuantityEl.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = subject ? 'Carregando...' : 'Selecione materia e nivel';
            filterQuantityEl.appendChild(placeholder);
            if (!subject) return;
            const questions = await fetchSubjectQuestions(subject);
            const filtered = level ? questions.filter(q => normalizeLevel(q.level || 'medio') === level) : questions;
            const max = filtered.length;
            filterQuantityEl.innerHTML = '';
            if (!max) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'Sem questoes para este nivel';
                filterQuantityEl.appendChild(opt);
                return;
            }
            const auto = document.createElement('option');
            auto.value = '';
            auto.textContent = 'Usar maximo disponivel';
            filterQuantityEl.appendChild(auto);
            for (let q = 5; q <= max; q += 5) {
                const opt = document.createElement('option');
                opt.value = String(q);
                opt.textContent = `${q} perguntas`;
                filterQuantityEl.appendChild(opt);
            }
            if (max % 5 !== 0 && max > 0) {
                const opt = document.createElement('option');
                opt.value = String(max);
                opt.textContent = `${max} perguntas (maximo)`;
                filterQuantityEl.appendChild(opt);
            }
        }

        // ---------------------- Quiz ----------------------
        function buildQuiz(questions) {
            // Desenha os cards de questões na tela do quiz.
            if (!quizFormEl) return;
            quizFormEl.innerHTML = '';
            questions.forEach((q, index) => {
                const card = document.createElement('div');
                card.className = 'question-card';

                const header = document.createElement('div');
                header.className = 'question-header';
                const title = document.createElement('h3');
                title.textContent = `Q${index + 1}. ${q.question}`;
                header.appendChild(title);
                if (q.theme) {
                    const badge = document.createElement('span');
                    badge.className = 'pill soft';
                    badge.textContent = q.theme;
                    header.appendChild(badge);
                }
                card.appendChild(header);

                const optionsList = document.createElement('div');
                optionsList.className = 'options-list';
                (q.options || []).forEach((opt, optIndex) => {
                    const row = document.createElement('label');
                    row.className = 'option-row';
                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = `answer-${index}`;
                    radio.value = optIndex;
                    const text = document.createElement('span');
                    text.innerHTML = `<strong>${String.fromCharCode(65 + optIndex)})</strong> ${opt}`;
                    row.appendChild(radio);
                    row.appendChild(text);
                    optionsList.appendChild(row);
                });
                card.appendChild(optionsList);
                quizFormEl.appendChild(card);
            });
        }

        function startTimer(totalSeconds) {
            // Relógio regressivo por quantidade de questões.
            clearInterval(timerInterval);
            timeLeft = totalSeconds;
            const tick = () => {
                if (timeLeft < 0) {
                    clearInterval(timerInterval);
                    submitQuiz();
                    return;
                }
                const hours = Math.floor(timeLeft / 3600);
                const minutes = Math.floor((timeLeft % 3600) / 60);
                const seconds = timeLeft % 60;
                if (timerElementEl) timerElementEl.textContent = `${formatTime(hours)}:${formatTime(minutes)}:${formatTime(seconds)}`;
                timeLeft--;
            };
            tick();
            timerInterval = setInterval(tick, 1000);
        }

        async function startQuiz() {
            // Monta quiz com filtros e inicia timer (Não tenho ideia como ta funcionandoKKK).
            const subject = filterSubjectSelectEl?.value;
            const level = normalizeLevel(filterLevelEl?.value || '');
            if (!subject) {
                alert('Selecione uma materia.');
                return;
            }
            const questions = await fetchSubjectQuestions(subject);
            const filtered = level ? questions.filter(q => normalizeLevel(q.level || 'medio') === level) : questions;
            if (!filtered.length) {
                alert('Sem questoes para este nivel.');
                return;
            }
            shuffleArray(filtered);
            const desired = parseInt(filterQuantityEl?.value || filtered.length, 10) || filtered.length;
            currentQuizData = filtered.slice(0, desired);
            currentSubject = subject;
            wrongQuestions = [];
            quizSubmitted = false;
            buildQuiz(currentQuizData);
            if (quizSubjectTitleEl) quizSubjectTitleEl.textContent = subject;
            showScreen('quiz');
            startTimer(Math.max(1, desired) * 60);
            if (resultsContainerEl) resultsContainerEl.style.display = 'none';
        }

        function submitQuiz() {
            if (!currentQuizData.length || quizSubmitted) return;
            quizSubmitted = true;
            clearInterval(timerInterval);
            let score = 0;
            wrongQuestions = [];
            currentQuizData.forEach((q, index) => {
                const chosen = quizFormEl?.querySelector(`input[name="answer-${index}"]:checked`);
                const chosenIdx = chosen ? parseInt(chosen.value, 10) : -1;
                if (chosenIdx === q.answer) score++; else wrongQuestions.push(q);
                const card = quizFormEl?.children[index];
                if (!card) return;
                const feedback = document.createElement('div');
                feedback.className = 'answer-feedback';
                const correctLetter = String.fromCharCode(65 + (q.answer || 0));
                feedback.innerHTML = `<p><strong>Resposta correta:</strong> ${correctLetter}</p>`;
                if (q.optionExplanations && q.optionExplanations.length) {
                    const list = document.createElement('ul');
                    list.className = 'explanation-list';
                    q.optionExplanations.forEach((exp, i) => {
                        const li = document.createElement('li');
                        li.innerHTML = `<strong>${String.fromCharCode(65 + i)}):</strong> ${exp || 'Sem explicacao'}`;
                        li.classList.add(i === q.answer ? 'correct' : (i === chosenIdx ? 'chosen' : ''));
                        list.appendChild(li);
                    });
                    feedback.appendChild(list);
                }
                card.appendChild(feedback);
            });
            if (scoreElementEl) scoreElementEl.textContent = `Acertos: ${score}/${currentQuizData.length}`;
            if (overallFeedbackElementEl) overallFeedbackElementEl.textContent = wrongQuestions.length ? 'Reforce os temas marcados e tente novamente.' : 'Excelente!';
            if (resultsContainerEl) resultsContainerEl.style.display = 'block';
            if (retryButtonEl) retryButtonEl.style.display = 'inline-flex';
            if (retryWrongButtonEl) retryWrongButtonEl.style.display = wrongQuestions.length ? 'inline-flex' : 'none';
            if (generateAiButtonEl) generateAiButtonEl.style.display = wrongQuestions.length ? 'inline-flex' : 'none';
        }

        function retryQuiz(useWrongOnly = false) {
            if (!currentQuizData.length) return;
            const base = useWrongOnly && wrongQuestions.length ? wrongQuestions : currentQuizData;
            shuffleArray(base);
            currentQuizData = base;
            quizSubmitted = false;
            buildQuiz(currentQuizData);
            if (resultsContainerEl) resultsContainerEl.style.display = 'none';
            startTimer(Math.max(1, currentQuizData.length) * 60);
        }

        // ---------------------- Grafico de temas ----------------------
        function renderInsights(subject) {
            if (insightChartEl) insightChartEl.innerHTML = 'Carregando...';
            if (!subject) {
                if (insightChartEl) insightChartEl.textContent = 'Selecione uma matéria para ver o gráfico.';
                return;
            }
            fetchSubjectQuestions(subject).then(questions => {
                if (!questions.length) {
                    if (insightChartEl) insightChartEl.textContent = 'Sem dados para esta matéria.';
                    return;
                }
                const counts = {};
                questions.forEach(q => {
                    const theme = q.theme || 'Sem tema';
                    counts[theme] = (counts[theme] || 0) + 1;
                });
                const max = Math.max(...Object.values(counts));
                const wrapper = document.createElement('div');
                wrapper.className = 'bar-list';
                Object.entries(counts).forEach(([theme, qty]) => {
                    const row = document.createElement('div');
                    row.className = 'bar-row';
                    const label = document.createElement('span');
                    label.textContent = theme;
                    const bar = document.createElement('div');
                    bar.className = 'bar';
                    bar.style.width = `${(qty / max) * 100}%`;
                    bar.textContent = qty;
                    row.appendChild(label);
                    row.appendChild(bar);
                    wrapper.appendChild(row);
                });
                if (insightChartEl) {
                    insightChartEl.innerHTML = '';
                    insightChartEl.appendChild(wrapper);
                }
            });
        }

        // ---------------------- Criar pergunta ----------------------
        function addOptionRow(defaultText = '', defaultExplanation = '', checked = false) {
            if (!optionsContainerEl) return;
            const index = optionsContainerEl.children.length;
            const row = document.createElement('div');
            row.className = 'option-edit-row';
            row.innerHTML = `
                <div class="inline">
                    <label class="pill soft" style="min-width:48px; text-align:center;">${String.fromCharCode(65 + index)})</label>
                    <input type="text" class="input option-text" placeholder="Texto da opcao" value="${defaultText}" />
                    <input type="text" class="input option-exp" placeholder="Explicacao da opcao" value="${defaultExplanation}" />
                    <label class="check-inline">
                        <input type="radio" name="correct-option" ${checked ? 'checked' : ''} /> Correta
                    </label>
                </div>`;
            optionsContainerEl.appendChild(row);
        }

        function initOptions() {
            if (!optionsContainerEl) return;
            optionsContainerEl.innerHTML = '';
            for (let i = 0; i < 4; i++) addOptionRow('', '', i === 0);
        }

        async function submitCreateQuestion(event) {
            event.preventDefault();
            if (createStatusEl) createStatusEl.textContent = '';
            const subject = (newSubjectEl?.value || '').trim() || (subjectSelectEl?.value || '');
            if (!subject) { if (createStatusEl) createStatusEl.textContent = 'Escolha ou crie uma materia.'; return; }
            const question = (questionTextEl?.value || '').trim();
            if (!question) { if (createStatusEl) createStatusEl.textContent = 'Digite o enunciado.'; return; }
            const optionRows = Array.from(optionsContainerEl?.querySelectorAll('.option-edit-row') || []);
            const options = optionRows.map(r => r.querySelector('.option-text')?.value.trim()).filter(Boolean);
            const explanations = optionRows.map(r => r.querySelector('.option-exp')?.value.trim() || '');
            const answerIndex = optionRows.findIndex(r => r.querySelector('input[type="radio"]')?.checked);
            if (!options.length || answerIndex < 0) { if (createStatusEl) createStatusEl.textContent = 'Adicione opcoes e marque a correta.'; return; }

            const formData = new FormData();
            formData.append('subject', subject);
            formData.append('question', question);
            formData.append('answer', answerIndex);
            formData.append('level', levelSelectEl?.value || 'medio');
            options.forEach(o => formData.append('options', o));
            explanations.forEach(exp => formData.append('optionExplanations', exp));
            Array.from(attachmentsEl?.files || []).forEach(file => formData.append('attachments', file));

            try {
                const res = await fetch('/api/questions', { method: 'POST', body: formData });
                if (!res.ok) throw new Error('Falha ao salvar');
                if (createStatusEl) createStatusEl.textContent = 'Pergunta salva com sucesso!';
                subjectQuestionsCache[subject] = null;
                if (questionTextEl) questionTextEl.value = '';
                if (attachmentsEl) attachmentsEl.value = '';
                initOptions();
                await loadSubjects();
            } catch (err) {
                console.error(err);
                if (createStatusEl) createStatusEl.textContent = 'Erro ao salvar a pergunta.';
            }
        }

        // ---------------------- Importar prova ----------------------
        async function submitExamForm(event) {
            event.preventDefault();
            if (addExamStatusEl) addExamStatusEl.textContent = '';
            const format = examFormatEl?.value || 'txt';
            const file = examFileEl?.files?.[0];
            const text = (examTextEl?.value || '').trim();
            if (!file && !text) { if (addExamStatusEl) addExamStatusEl.textContent = 'Envie um arquivo ou cole o texto.'; return; }
            const formData = new FormData();
            formData.append('format', format);
            if (file) formData.append('examFile', file);
            else {
                const blob = new Blob([text], { type: 'text/plain' });
                formData.append('examFile', blob, `prova.${format}`);
            }
            try {
                const res = await fetch('/api/exams', { method: 'POST', body: formData });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Falha ao salvar');
                if (addExamStatusEl) addExamStatusEl.textContent = `Prova salva. Importadas: ${data.importedQuestions || 0}`;
                if (examFileEl) examFileEl.value = '';
                if (examTextEl) examTextEl.value = '';
                await loadSubjects();
            } catch (err) {
                console.error(err);
                if (addExamStatusEl) addExamStatusEl.textContent = 'Erro ao salvar prova.';
            }
        }

        // ---------------------- Gerenciar simulados ----------------------
        async function loadExams() {
            if (manageExamsListEl) manageExamsListEl.textContent = 'Carregando simulados...';
            try {
                const res = await fetch('/api/exams');
                const exams = await res.json();
                if (!Array.isArray(exams) || !exams.length) {
                    if (manageExamsListEl) manageExamsListEl.textContent = 'Nenhum simulado cadastrado.';
                    return;
                }
                if (manageExamsListEl) manageExamsListEl.innerHTML = '';
                exams.forEach(ex => {
                    const row = document.createElement('div');
                    row.className = 'table-row';
                    row.innerHTML = `
                        <span>${ex.subject || '-'}</span>
                        <span>${ex.level || '-'}</span>
                        <span>${ex.importedQuestions || 0}</span>
                        <span>${ex.uploadedAt ? new Date(ex.uploadedAt).toLocaleString() : '-'}</span>
                        <span><button class="ghost-button danger" data-id="${ex.id}">Remover</button></span>
                    `;
                    manageExamsListEl?.appendChild(row);
                });
            } catch (err) {
                console.error(err);
                if (manageExamsListEl) manageExamsListEl.textContent = 'Erro ao carregar simulados.';
            }
        }

        async function deleteExam(id) {
            const password = (managePasswordEl?.value || '').trim();
            if (!password) { alert('Digite a senha (1402) para remover.'); return; }
            try {
                const res = await fetch(`/api/exams/${id}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Falha ao remover');
                await loadExams();
                await loadSubjects();
            } catch (err) {
                alert(err.message);
            }
        }

        manageExamsListEl?.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-id]');
            if (!btn) return;
            deleteExam(btn.dataset.id);
        });

        // ---------------------- Exportar TXT ----------------------
        async function exportQuestions() {
            const subject = filterSubjectSelectEl?.value;
            if (!subject) { alert('Selecione uma materia.'); return; }
            try {
                const res = await fetch(`/api/export/${encodeURIComponent(subject)}`);
                if (!res.ok) throw new Error('Falha ao exportar');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${subject.replace(/\s+/g, '_')}.txt`;
                a.click();
                window.URL.revokeObjectURL(url);
            } catch (err) {
                alert('Erro ao exportar perguntas.');
            }
        }

        // ---------------------- Prompt ----------------------
        async function loadPrompt() {
            try {
                const res = await fetch('/api/prompt');
                const data = await res.json();
                const raw = data.prompt || '';
                if (promptTemplateEl) promptTemplateEl.value = raw.replace(/\\n/g, '\n');
            } catch (err) { console.error('Erro ao carregar prompt', err); }
        }

        async function savePrompt(event) {
            event.preventDefault();
            if (promptStatusEl) promptStatusEl.textContent = '';
            try {
                const res = await fetch('/api/prompt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: promptTemplateEl?.value || '' })
                });
                if (!res.ok) throw new Error('Falha ao salvar');
                if (promptStatusEl) promptStatusEl.textContent = 'Prompt salvo.';
            } catch (err) {
                if (promptStatusEl) promptStatusEl.textContent = 'Erro ao salvar prompt.';
            }
        }

        // ---------------------- Gerar IA (placeholder) ----------------------
        async function generateAiQuestions() {
            if (!currentSubject) return;
            try {
                const res = await fetch('/api/generate-questions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subject: currentSubject, wrongQuestions, level: filterLevelEl?.value })
                });
                const data = await res.json();
                if (!Array.isArray(data) || !data.length) return;
                currentQuizData = data;
                quizSubmitted = false;
                buildQuiz(currentQuizData);
                if (resultsContainerEl) resultsContainerEl.style.display = 'none';
                startTimer(Math.max(1, currentQuizData.length) * 60);
            } catch (err) {
                console.error('Erro ao gerar IA', err);
            }
        }

        // ---------------------- Eventos ----------------------
        logoHomeEl?.addEventListener('click', () => safeNavigate('start'));
        goToStartEl?.addEventListener('click', () => safeNavigate('start'));
        goToSettingsEl?.addEventListener('click', () => safeNavigate('settings'));
        goToAddExamEl?.addEventListener('click', () => safeNavigate('addExam'));
        goToCreateEl?.addEventListener('click', () => safeNavigate('create'));
        goToManageExamsEl?.addEventListener('click', async () => { safeNavigate('manageExams'); await loadExams(); });
        openPromptScreenEl?.addEventListener('click', async () => { safeNavigate('prompt'); await loadPrompt(); });
        backFromPromptEl?.addEventListener('click', () => safeNavigate('settings'));

        sidebarToggleEl?.addEventListener('click', toggleSidebar);
        toggleThemeEl?.addEventListener('click', toggleTheme);
        toggleThemeQuickEl?.addEventListener('click', toggleTheme);

        filterSubjectSelectEl?.addEventListener('change', updateQuantityOptions);
        filterLevelEl?.addEventListener('change', updateQuantityOptions);
        startFilteredButtonEl?.addEventListener('click', startQuiz);
        exportTxtButtonEl?.addEventListener('click', exportQuestions);

        retryButtonEl?.addEventListener('click', () => retryQuiz(false));
        retryWrongButtonEl?.addEventListener('click', () => retryQuiz(true));
        submitButtonEl?.addEventListener('click', submitQuiz);
        generateAiButtonEl?.addEventListener('click', generateAiQuestions);

        insightSubjectSelectEl?.addEventListener('change', (e) => renderInsights(e.target.value));

        addOptionButtonEl?.addEventListener('click', () => addOptionRow());
        createFormEl?.addEventListener('submit', submitCreateQuestion);
        addExamFormEl?.addEventListener('submit', submitExamForm);

        reloadExamsEl?.addEventListener('click', loadExams);

        promptFormEl?.addEventListener('submit', savePrompt);

        // ---------------------- Init ----------------------
        applyTheme(currentTheme);
        initOptions();
        loadSubjects().then(updateQuantityOptions);
    }

    // Helpers globais simples
    function get(id) { return document.getElementById(id); }
    function setDisplay(el, show) {
        if (!el) return;
        if (!el.dataset.displayOriginal) {
            const original = getComputedStyle(el).display;
            el.dataset.displayOriginal = original && original !== 'none' ? original : 'block';
        }
        el.style.display = show ? el.dataset.displayOriginal : 'none';
    }
})();


