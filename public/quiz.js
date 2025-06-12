document.addEventListener('DOMContentLoaded', () => {
    const startScreenEl = document.getElementById('startScreen');
    const quizAreaEl = document.getElementById('quizArea');
    const subjectSelectionEl = document.getElementById('subject-selection');
    const loadingMessageEl = document.getElementById('loading-message');
    const quizSubjectTitleEl = document.getElementById('quiz-subject-title');
    const quizFormEl = document.getElementById('quizForm');
    const timerElementEl = document.getElementById('timer');
    const submitButtonEl = document.getElementById('submitButton');
    const resultsContainerEl = document.getElementById('results');
    const scoreElementEl = document.getElementById('score');
    const overallFeedbackElementEl = document.getElementById('overallFeedback');
    const retryButtonEl = document.getElementById('retryButton');

    let currentQuizData = [];
    let timeLeft;
    let timerInterval;
    let quizSubmitted = false;

    // --- CARREGAMENTO INICIAL DAS MATÉRIAS ---
    async function loadSubjects() {
        try {
            const response = await fetch('/api/subjects');
            const subjects = await response.json();
            
            loadingMessageEl.style.display = 'none';
            subjectSelectionEl.innerHTML = ''; // Limpa botões antigos

            subjects.forEach(subject => {
                const button = document.createElement('button');
                button.classList.add('action-button');
                button.textContent = subject;
                button.onclick = () => startQuiz(subject);
                subjectSelectionEl.appendChild(button);
            });
        } catch (error) {
            console.error('Erro ao carregar matérias:', error);
            loadingMessageEl.textContent = 'Falha ao carregar matérias. Tente recarregar a página.';
        }
    }

    // --- LÓGICA DO QUIZ ---
    async function startQuiz(subject) {
        try {
            const response = await fetch(`/api/questions/${subject}`);
            currentQuizData = await response.json();

            if (currentQuizData.length === 0) {
                alert(`A matéria "${subject}" não tem perguntas no banco de dados.`);
                return;
            }

            initializeQuiz(subject);
        } catch (error) {
            console.error(`Erro ao carregar perguntas para ${subject}:`, error);
            alert('Falha ao carregar as perguntas. Tente novamente.');
        }
    }

    function initializeQuiz(subject) {
        quizSubjectTitleEl.textContent = subject;
        startScreenEl.style.display = 'none';
        quizAreaEl.style.display = 'block';
        resultsContainerEl.style.display = 'none';
        retryButtonEl.style.display = 'none';
        submitButtonEl.style.display = 'inline-block';
        submitButtonEl.disabled = false;

        shuffleArray(currentQuizData);

        quizFormEl.innerHTML = '';
        buildQuiz();

        timeLeft = (currentQuizData.length * 60) * 1.8; // Ex: 1.8 minutos por questão
        quizSubmitted = false;
        if (timerInterval) clearInterval(timerInterval);
        startTimer();
        window.scrollTo(0, 0);
    }

    // ... (As funções shuffleArray, buildQuiz, startTimer, finalizeQuiz, formatTime são as mesmas da versão anterior) ...
    function formatTime(num) { return num < 10 ? '0' + num : num; }
    function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }
    function buildQuiz() {
        currentQuizData.forEach((currentQuestion, questionNumber) => {
            const questionBlock = document.createElement('div');
            questionBlock.classList.add('question-block');
            questionBlock.innerHTML = `<h3>${questionNumber + 1}. ${currentQuestion.question}</h3>`;
            const optionsDiv = document.createElement('div');
            optionsDiv.classList.add('options');
            currentQuestion.options.forEach((option, index) => {
                const label = document.createElement('label');
                label.id = `q${questionNumber}_opt${index}_label`;
                label.setAttribute('for', `q${questionNumber}_opt${index}`);
                const input = document.createElement('input');
                input.type = 'radio';
                input.name = `question${questionNumber}`;
                input.value = index;
                input.id = `q${questionNumber}_opt${index}`;
                label.appendChild(input);
                label.appendChild(document.createTextNode(" " + option));
                optionsDiv.appendChild(label);
            });
            questionBlock.appendChild(optionsDiv);
            const inlineFeedbackDiv = document.createElement('div');
            inlineFeedbackDiv.classList.add('inline-feedback');
            inlineFeedbackDiv.id = `feedback_q${questionNumber}`;
            questionBlock.appendChild(inlineFeedbackDiv);
            quizFormEl.appendChild(questionBlock);
        });
    }

    function startTimer() {
        timerInterval = setInterval(() => {
            const hours = Math.floor(timeLeft / 3600);
            const minutes = Math.floor((timeLeft % 3600) / 60);
            const seconds = timeLeft % 60;
            if (timerElementEl) timerElementEl.textContent = `Tempo Restante: ${formatTime(hours)}:${formatTime(minutes)}:${formatTime(seconds)}`;
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                if(timerElementEl) timerElementEl.textContent = "Tempo Esgotado!";
                if (!quizSubmitted) finalizeQuiz(true);
            }
            if (timeLeft > 0) timeLeft--;
        }, 1000);
    }

    function finalizeQuiz(timeUp = false) {
        if (quizSubmitted) return;
        quizSubmitted = true;
        clearInterval(timerInterval);
        if (submitButtonEl) submitButtonEl.disabled = true;
        let score = 0;
        let answeredAll = true;
        currentQuizData.forEach((currentQuestion, questionNumber) => {
            const answerInputs = document.getElementsByName(`question${questionNumber}`);
            let userAnswer = -1;
            answerInputs.forEach(input => { if (input.checked) userAnswer = parseInt(input.value); });
            answerInputs.forEach(input => input.disabled = true);
            const correctAnswer = currentQuestion.answer;
            const optionLabels = [];
            for (let i = 0; i < currentQuestion.options.length; i++) { const labelEl = document.getElementById(`q${questionNumber}_opt${i}_label`); if (labelEl) optionLabels.push(labelEl); else optionLabels.push(null); }
            const inlineFeedbackDiv = document.getElementById(`feedback_q${questionNumber}`);
            if (inlineFeedbackDiv) { inlineFeedbackDiv.innerHTML = ''; inlineFeedbackDiv.classList.remove('feedback-incorrect-attempt', 'feedback-not-answered'); }
            if (userAnswer === -1) answeredAll = false;
            if (userAnswer === correctAnswer) { score++; if (optionLabels[userAnswer]) optionLabels[userAnswer].classList.add('correct-answer-style'); }
            else {
                let feedbackText = '';
                if (userAnswer !== -1) {
                    if (optionLabels[userAnswer]) optionLabels[userAnswer].classList.add('incorrect-answer-style');
                    feedbackText += `<em>Sua resposta: ${currentQuestion.options[userAnswer]}</em>`;
                    if (inlineFeedbackDiv) inlineFeedbackDiv.classList.add('feedback-incorrect-attempt');
                } else {
                    feedbackText += `<em>Sua resposta: Não respondida</em>`;
                    if (inlineFeedbackDiv) inlineFeedbackDiv.classList.add('feedback-not-answered');
                }
                if (optionLabels[correctAnswer]) optionLabels[correctAnswer].classList.add('correct-answer-style');
                feedbackText += `<br><em>Resposta correta: ${currentQuestion.options[correctAnswer]}</em>`;
                if (inlineFeedbackDiv) inlineFeedbackDiv.innerHTML = feedbackText;
            }
        });
        const percentage = (currentQuizData.length > 0) ? (score / currentQuizData.length) * 100 : 0;
        scoreElementEl.textContent = `Sua pontuação: ${score} de ${currentQuizData.length} (${percentage.toFixed(2)}%)`;
        if (timeUp && !answeredAll) overallFeedbackElementEl.textContent = "Tempo esgotado! Algumas questões não foram respondidas.";
        else if (!answeredAll) overallFeedbackElementEl.textContent = "Algumas questões não foram respondidas. Verifique o feedback em cada questão.";
        else if (score === currentQuizData.length && currentQuizData.length > 0) overallFeedbackElementEl.textContent = "Parabéns! Você acertou todas as questões!";
        else overallFeedbackElementEl.textContent = "Verifique o feedback em cada questão para ver os detalhes.";
        resultsContainerEl.style.display = 'block';
        retryButtonEl.style.display = 'inline-block';
        resultsContainerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function returnToStartScreen() {
        quizAreaEl.style.display = 'none';
        startScreenEl.style.display = 'flex';
        if (timerInterval) clearInterval(timerInterval);
    }
    
    // --- OUVINTES DE EVENTO E INICIALIZAÇÃO ---
    submitButtonEl.addEventListener('click', () => finalizeQuiz(false));
    retryButtonEl.addEventListener('click', returnToStartScreen);
    
    // Inicia o processo carregando as matérias disponíveis
    loadSubjects();
});