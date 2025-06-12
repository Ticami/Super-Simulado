const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// Serve os arquivos estáticos da pasta 'public' (nosso frontend)
app.use(express.static('public'));

// Rota da API para obter a lista de matérias
app.get('/api/subjects', (req, res) => {
    fs.readFile(path.join(__dirname, 'database.json'), 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Erro ao ler o banco de dados.');
        }
        const database = JSON.parse(data);
        const subjects = Object.keys(database);
        res.json(subjects);
    });
});

// Rota da API para obter as perguntas de uma matéria específica
app.get('/api/questions/:subject', (req, res) => {
    const subject = req.params.subject;
    fs.readFile(path.join(__dirname, 'database.json'), 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Erro ao ler o banco de dados.');
        }
        const database = JSON.parse(data);
        if (database[subject]) {
            res.json(database[subject]);
        } else {
            res.status(404).send('Matéria não encontrada.');
        }
    });
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});