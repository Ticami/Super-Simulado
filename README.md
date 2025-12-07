# Super Simulado 🧠💡

Dash simples para montar simulados, importar provas e praticar por matéria.

## Como rodar
- `npm install`
- `npm start`
- Abra em `http://localhost:3000`

## Fluxo principal
- Escolha matéria, nível e quantidade na tela inicial e clique em **Iniciar prova**.
- Faça a prova, veja acertos/erros e refaça apenas o que errou.
- Importe provas `.txt`/`.csv` em **Adicionar prova**; o backend salva por matéria em `subjects/*.json`.
- Consulte e remova simulados em **Editar/Remover simulados** (senha padrão `1402`).
- Ajuste tema claro/escuro em **Configurações**.

## Estrutura rápida
- `public/` — frontend (HTML, CSS, JS).
- `server.js` — API Express.
- `subjects/` — banco de questões por matéria.
- `exams/` e `exams-data/` — arquivos importados e seus metadados.
- `exams.json` — lista de provas importadas.

## Observações
- Os dados são salvos em disco local; não há banco externo.
- Se importar um `.txt` no formato do modelo, o servidor tenta converter em perguntas automaticamente.
