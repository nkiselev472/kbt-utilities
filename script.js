// Основной файл приложения
document.addEventListener('DOMContentLoaded', () => {
    // Инициализация компонентов
    const scanner = window.qrScanner;
    const auth = window.googleAuth;
    
    // Элементы UI
    const startBtn = document.getElementById('startScanner');
    const stopBtn = document.getElementById('stopScanner');
    const sendBtn = document.getElementById('sendToSheet');
    const clearLogBtn = document.getElementById('clearLog');
    
    // Текущий извлеченный номер
    let currentNumber = null;
    
    // Инициализация кнопок
    startBtn.addEventListener('click', async () => {
        try {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            await scanner.start();
        } catch (error) {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            showMessage('Ошибка запуска сканера', 'error');
        }
    });
    
    stopBtn.addEventListener('click', () => {
        scanner.stop();
        startBtn.disabled = false;
        stopBtn.disabled = true;
        sendBtn.disabled = true;
    });
    
    sendBtn.addEventListener('click', async () => {
        const number = document.getElementById('extractedNumber').textContent;
        
        if (!number || number === '—' || number === 'Неверный формат!') {
            showMessage('Нет корректного номера для отправки', 'error');
            return;
        }
        
        try {
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отправка...';
            
            const result = await auth.appendToSheet(number);
            
            if (result.success) {
                showMessage(`Успешно записано в строку ${result.row}`, 'success');
                
                // Сбрасываем интерфейс
                document.getElementById('rawData').textContent = '—';
                document.getElementById('extractedNumber').textContent = '—';
                document.getElementById('extractedNumber').className = 'result-value';
                
                // Воспроизводим звук отправки
                playSendSound();
                
                // Показываем ссылку на таблицу
                setTimeout(() => {
                    if (confirm('Данные отправлены! Открыть таблицу?')) {
                        window.open(
                            'https://docs.google.com/spreadsheets/d/1jST0QufgFkGuvvQ-iweX21L_LqC0jr4ii7sdHI5wVPU/edit',
                            '_blank'
                        );
                    }
                }, 500);
            }
        } catch (error) {
            showMessage(`Ошибка отправки: ${error.message}`, 'error');
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Записать в таблицу';
        }
    });
    
    clearLogBtn.addEventListener('click', () => {
        const logContent = document.getElementById('logContent');
        logContent.innerHTML = '';
        scanner.log('Журнал очищен');
    });
    
    // Вспомогательные функции
    function showMessage(text, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = text;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 10px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        
        const bgColor = {
            success: '#10b981',
            error: '#ef4444',
            info: '#3b82f6'
        }[type] || '#3b82f6';
        
        messageDiv.style.background = bgColor;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => messageDiv.remove(), 300);
        }, 3000);
    }
    
    function playSendSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.1);
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            // Игнорируем ошибки аудио
        }
    }
    
    // Добавляем стили для анимаций сообщений
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        
        .message {
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
    `;
    document.head.appendChild(style);
    
    // Инициализация приложения
    scanner.log('Приложение KBT Utilities загружено');
    scanner.updateStatus('ready', 'Нажмите "Запустить сканер" для начала');
    
    // Проверяем поддержку камеры
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        scanner.log('Ваш браузер не поддерживает доступ к камере');
        showMessage('Браузер не поддерживает камеру', 'error');
        startBtn.disabled = true;
    }
});