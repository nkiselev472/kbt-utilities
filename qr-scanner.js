class QRScanner {
    constructor() {
        this.videoElement = document.getElementById('qrVideo');
        this.canvasElement = document.getElementById('qrCanvas');
        this.canvasContext = this.canvasElement.getContext('2d');
        this.isScanning = false;
        this.scanInterval = null;
        this.lastResult = null;
        
        // Поддерживаемые форматы
        this.barcodeFormats = {
            qrCode: true,
            aztec: false,
            code128: false,
            code39: false,
            code93: false,
            codabar: false,
            databar: false,
            databarExpanded: false,
            dataMatrix: false,
            dxFilmEdge: false,
            ean13: false,
            ean8: false,
            itf: false,
            maxiCode: false,
            microQRCode: false,
            pdf417: false,
            qrCode: true,
            upcA: false,
            upcE: false,
            linearCodes: false,
            matrixCodes: true
        };
    }

    async start() {
        if (this.isScanning) return;
        
        try {
            // Запрашиваем доступ к камере
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment', // Используем заднюю камеру
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });
            
            this.videoElement.srcObject = stream;
            this.isScanning = true;
            
            // Ждем готовности видео
            await new Promise(resolve => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play();
                    resolve();
                };
            });
            
            // Настраиваем canvas
            this.canvasElement.width = this.videoElement.videoWidth;
            this.canvasElement.height = this.videoElement.videoHeight;
            
            // Запускаем сканирование
            this.startScanning();
            
            this.log('Сканирование запущено');
            this.updateStatus('scanning', 'Сканирование... Наведите на QR-код');
            
        } catch (error) {
            console.error('Ошибка доступа к камере:', error);
            
            let errorMessage = 'Не удалось получить доступ к камере';
            if (error.name === 'NotAllowedError') {
                errorMessage = 'Доступ к камере запрещен. Разрешите доступ в настройках браузера';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'Камера не найдена';
            } else if (error.name === 'NotSupportedError') {
                errorMessage = 'Браузер не поддерживает доступ к камере';
            }
            
            this.log(`Ошибка: ${errorMessage}`);
            this.updateStatus('error', errorMessage);
            throw error;
        }
    }

    stop() {
        if (!this.isScanning) return;
        
        // Останавливаем сканирование
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        
        // Останавливаем поток камеры
        if (this.videoElement.srcObject) {
            const stream = this.videoElement.srcObject;
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
        
        this.isScanning = false;
        this.updateStatus('ready', 'Сканирование остановлено');
        this.log('Сканирование остановлено');
    }

    startScanning() {
        // Используем jsQR библиотеку (нужно подключить в HTML)
        this.scanInterval = setInterval(() => {
            if (!this.videoElement.videoWidth) return;
            
            // Рисуем текущий кадр на canvas
            this.canvasContext.drawImage(
                this.videoElement,
                0, 0,
                this.canvasElement.width,
                this.canvasElement.height
            );
            
            // Получаем данные изображения
            const imageData = this.canvasContext.getImageData(
                0, 0,
                this.canvasElement.width,
                this.canvasElement.height
            );
            
            // Пытаемся декодировать QR-код
            const code = this.decodeQR(imageData);
            
            if (code) {
                this.processResult(code.data);
            }
        }, 100); // Проверяем каждые 100ms
    }

    decodeQR(imageData) {
        try {
            // Используем jsQR если доступен
            if (typeof jsQR === 'function') {
                return jsQR(
                    imageData.data,
                    imageData.width,
                    imageData.height,
                    {
                        inversionAttempts: 'dontInvert',
                    }
                );
            }
            
            // Альтернативная реализация с помощью BarcodeDetector API
            if ('BarcodeDetector' in window) {
                // Для современных браузеров
                return null; // Реализуйте при необходимости
            }
            
            return null;
        } catch (error) {
            console.error('Ошибка декодирования QR:', error);
            return null;
        }
    }

    processResult(data) {
        // Игнорируем повторные считывания того же кода
        if (data === this.lastResult) return;
        
        this.lastResult = data;
        this.log(`Считан QR-код: ${data}`);
        
        // Отображаем исходные данные
        document.getElementById('rawData').textContent = 
            data.length > 30 ? data.substring(0, 30) + '...' : data;
        
        // Извлекаем номер по шаблону $1:1:XXXXXXXXXX:YYYYYY
        const pattern = /\$1:1:(\d{10}):\d+/;
        const match = data.match(pattern);
        
        if (match && match[1]) {
            const extractedNumber = match[1];
            
            // Отображаем извлеченный номер
            document.getElementById('extractedNumber').textContent = extractedNumber;
            document.getElementById('extractedNumber').className = 'result-value highlighted';
            
            // Активируем кнопку отправки
            document.getElementById('sendToSheet').disabled = false;
            document.getElementById('sendToSheet').innerHTML = 
                `<i class="fas fa-cloud-upload-alt"></i> Записать "${extractedNumber}"`;
            
            this.updateStatus('success', `Найден номер: ${extractedNumber}`);
            this.log(`Извлечен номер: ${extractedNumber}`);
            
            // Воспроизводим звук успеха (опционально)
            this.playSuccessSound();
            
        } else {
            // Неверный формат
            document.getElementById('extractedNumber').textContent = 'Неверный формат!';
            document.getElementById('extractedNumber').className = 'result-value';
            document.getElementById('extractedNumber').style.background = '#fee2e2';
            document.getElementById('extractedNumber').style.color = '#991b1b';
            
            document.getElementById('sendToSheet').disabled = true;
            
            this.updateStatus('error', 'Неверный формат QR-кода');
            this.log('Ошибка: QR-код не соответствует формату $1:1:XXXXXXXXXX:YYYYYY');
        }
    }

    playSuccessSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            // Игнорируем ошибки аудио
        }
    }

    updateStatus(type, message) {
        const statusCard = document.getElementById('statusCard');
        const statusIcon = statusCard.querySelector('.status-icon');
        const statusInfo = statusCard.querySelector('.status-info');
        
        // Обновляем иконку
        const icons = {
            ready: 'fa-camera',
            scanning: 'fa-search',
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle'
        };
        
        const colors = {
            ready: '#4f46e5',
            scanning: '#f59e0b',
            success: '#10b981',
            error: '#ef4444'
        };
        
        statusIcon.innerHTML = `<i class="fas ${icons[type] || icons.ready}"></i>`;
        statusIcon.style.background = colors[type] || colors.ready;
        
        // Обновляем текст
        const h3 = statusInfo.querySelector('h3');
        const p = statusInfo.querySelector('p');
        
        const titles = {
            ready: 'Готов к сканированию',
            scanning: 'Сканирование...',
            success: 'QR-код распознан!',
            error: 'Ошибка распознавания'
        };
        
        h3.textContent = titles[type] || titles.ready;
        p.textContent = message;
    }

    log(message) {
        const time = new Date().toLocaleTimeString('ru-RU', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = `
            <span class="log-time">${time}</span>
            <span class="log-text">${message}</span>
        `;
        
        const logContent = document.getElementById('logContent');
        logContent.appendChild(logEntry);
        logContent.scrollTop = logContent.scrollHeight;
    }
}

// Глобальный экземпляр
const qrScanner = new QRScanner();

// Экспортируем для использования в script.js
window.qrScanner = qrScanner;