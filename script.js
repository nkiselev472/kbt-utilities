// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЕ ====================
let state = {
    currentMode: 'transfer',
    transferData: [], // Теперь объекты: {id, number, date}
    qrCodes: []
};

let activeScanner = null;
let isScanning = false;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('KBT Utilities загружается...');
    
    loadFromLocalStorage();
    initTheme();
    initModeSwitcher();
    initExportButtons();
    initImportExport();
    initClearButtons();
    
    // Инициализация сканеров
    initTransferScanner();
    initGenericScanner();
    
    renderTransferHistory();
    renderQRCodesGallery();
    
    console.log('Приложение готово! Загружено:', {
        transfers: state.transferData.length,
        qrCodes: state.qrCodes.length
    });
});

// ==================== ТЕМНАЯ/СВЕТЛАЯ ТЕМА ====================
function initTheme() {
    const toggleBtn = document.getElementById('themeToggle');
    
    const savedTheme = localStorage.getItem('kbt_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', initialTheme);
    updateThemeButton(initialTheme, toggleBtn);
    
    toggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('kbt_theme', newTheme);
        updateThemeButton(newTheme, toggleBtn);
        
        // Перерисовываем QR коды с новой темой
        renderQRCodesGallery();
    });
}

function updateThemeButton(theme, button) {
    button.textContent = theme === 'dark' ? '☀️' : '🌙';
    button.title = theme === 'dark' ? 'Светлая тема' : 'Темная тема';
}

// ==================== ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ ====================
function initModeSwitcher() {
    const modeButtons = document.querySelectorAll('.mode-btn');
    
    modeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const mode = this.dataset.mode;
            
            // Останавливаем сканирование при переключении
            if (isScanning) {
                stopActiveScanner();
            }
            
            // Обновляем кнопки
            modeButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Переключаем панели
            document.querySelectorAll('.scanner-panel').forEach(panel => {
                panel.classList.remove('active');
            });
            document.getElementById(`${mode}-scanner`).classList.add('active');
            
            state.currentMode = mode;
            
            console.log(`Переключен режим: ${mode === 'transfer' ? 'Сканер передач' : 'Сканер шк'}`);
        });
    });
}

// ==================== СКАНЕР ПЕРЕДАЧ (ИСПРАВЛЕН) ====================
function initTransferScanner() {
    const startBtn = document.getElementById('startTransferScan');
    const stopBtn = document.getElementById('stopTransferScan');
    
    if (!startBtn || !stopBtn) return;
    
    startBtn.addEventListener('click', startTransferScanning);
    stopBtn.addEventListener('click', stopTransferScanning);
}

function startTransferScanning() {
    if (isScanning) return;
    
    const startBtn = document.getElementById('startTransferScan');
    const stopBtn = document.getElementById('stopTransferScan');
    const readerDiv = document.getElementById('transfer-reader');
    
    if (!readerDiv) return;
    
    // Очищаем контейнер
    readerDiv.innerHTML = '';
    
    try {
        // Проверяем, загружена ли библиотека
        if (typeof Html5Qrcode === 'undefined') {
            showNotification('Библиотека сканера не загружена', 'error');
            return;
        }
        
        activeScanner = new Html5Qrcode("transfer-reader");
        
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            disableFlip: false
        };
        
        activeScanner.start(
            { facingMode: "environment" },
            config,
            onTransferScanSuccess,
            onTransferScanError
        ).then(() => {
            isScanning = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            readerDiv.style.border = "3px solid #4CAF50";
            console.log('Сканер передач запущен');
        }).catch(err => {
            console.error('Ошибка запуска сканера передач:', err);
            showNotification(`Ошибка камеры: ${err.message || err}`, 'error');
            activeScanner = null;
        });
        
    } catch (error) {
        console.error('Ошибка создания сканера:', error);
        showNotification('Ошибка создания сканера', 'error');
    }
}

function stopTransferScanning() {
    if (!activeScanner || !isScanning) return;
    
    const startBtn = document.getElementById('startTransferScan');
    const stopBtn = document.getElementById('stopTransferScan');
    const readerDiv = document.getElementById('transfer-reader');
    
    activeScanner.stop().then(() => {
        isScanning = false;
        activeScanner = null;
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (readerDiv) readerDiv.style.border = "";
        
        console.log('Сканер передач остановлен');
    }).catch(err => {
        console.error('Ошибка остановки сканера:', err);
        isScanning = false;
        activeScanner = null;
    });
}

function onTransferScanSuccess(decodedText) {
    console.log('Отсканировано (передачи):', decodedText);
    
    const pattern = /\$1:1:(\d{10}):/;
    const match = decodedText.match(pattern);
    
    if (!match) {
        showNotification('Неверный формат. Ожидается: $1:1:XXXXXXXXXX:', 'warning');
        playErrorSound();
        return;
    }
    
    const tenDigitNumber = match[1];
    const timestamp = new Date().toISOString();
    const dateDisplay = new Date().toLocaleString('ru-RU');
    
    // Проверяем дубликаты
    const isDuplicate = state.transferData.some(item => item.number === tenDigitNumber);
    if (isDuplicate) {
        showNotification(`Номер ${tenDigitNumber} уже отсканирован`, 'warning');
        return;
    }
    
    // Добавляем объект с датой
    const transferItem = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        number: tenDigitNumber,
        timestamp: timestamp,
        dateDisplay: dateDisplay,
        date: new Date() // Для сортировки
    };
    
    state.transferData.push(transferItem);
    saveToLocalStorage();
    
    // Сортируем по дате (новые сверху)
    sortTransferData();
    renderTransferHistory();
    
    showNotification(`Добавлено: ${tenDigitNumber}`, 'success');
    playSuccessSound();
    
    // Мигание для обратной связи
    const readerDiv = document.getElementById('transfer-reader');
    if (readerDiv) {
        readerDiv.style.border = "3px solid #00FF00";
        setTimeout(() => {
            if (isScanning) readerDiv.style.border = "3px solid #4CAF50";
        }, 300);
    }
}

function onTransferScanError(error) {
    // Игнорируем ошибки поиска кода
    if (!error.includes('NotFoundException') && !error.includes('No QR code')) {
        console.log('Ошибка сканирования (передачи):', error);
    }
}

// ==================== СКАНЕР ШК (ИСПРАВЛЕН - НЕ ОСТАНАВЛИВАЕТСЯ) ====================
function initGenericScanner() {
    const startBtn = document.getElementById('startGenericScan');
    const stopBtn = document.getElementById('stopGenericScan');
    
    if (!startBtn || !stopBtn) return;
    
    startBtn.addEventListener('click', startGenericScanning);
    stopBtn.addEventListener('click', stopGenericScanning);
}

function startGenericScanning() {
    if (isScanning) return;
    
    const startBtn = document.getElementById('startGenericScan');
    const stopBtn = document.getElementById('stopGenericScan');
    const readerDiv = document.getElementById('generic-reader');
    
    if (!readerDiv) return;
    
    // Очищаем контейнер
    readerDiv.innerHTML = '';
    
    try {
        if (typeof Html5Qrcode === 'undefined') {
            showNotification('Библиотека сканера не загружена', 'error');
            return;
        }
        
        activeScanner = new Html5Qrcode("generic-reader");
        
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            disableFlip: false
        };
        
        activeScanner.start(
            { facingMode: "environment" },
            config,
            onGenericScanSuccess,
            onGenericScanError,
            true // ВАЖНО: продолжаем сканирование после успеха!
        ).then(() => {
            isScanning = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            readerDiv.style.border = "3px solid #2196F3";
            console.log('Сканер шк запущен (непрерывное сканирование)');
        }).catch(err => {
            console.error('Ошибка запуска сканера шк:', err);
            showNotification(`Ошибка камеры: ${err.message || err}`, 'error');
            activeScanner = null;
        });
        
    } catch (error) {
        console.error('Ошибка создания сканера:', error);
        showNotification('Ошибка создания сканера', 'error');
    }
}

function stopGenericScanning() {
    if (!activeScanner || !isScanning) return;
    
    const startBtn = document.getElementById('startGenericScan');
    const stopBtn = document.getElementById('stopGenericScan');
    const readerDiv = document.getElementById('generic-reader');
    
    activeScanner.stop().then(() => {
        isScanning = false;
        activeScanner = null;
        
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
        if (readerDiv) readerDiv.style.border = "";
        
        console.log('Сканер шк остановлен');
    }).catch(err => {
        console.error('Ошибка остановки сканера:', err);
        isScanning = false;
        activeScanner = null;
    });
}

function onGenericScanSuccess(decodedText) {
    console.log('Отсканировано (шк):', decodedText);
    
    // Проверяем дубликаты
    const existingIndex = state.qrCodes.findIndex(qr => qr.text === decodedText);
    if (existingIndex !== -1) {
        showNotification('Этот QR-код уже отсканирован', 'warning');
        playErrorSound();
        return;
    }
    
    const qrObject = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        text: decodedText,
        timestamp: new Date().toISOString(),
        dateDisplay: new Date().toLocaleString('ru-RU')
    };
    
    state.qrCodes.unshift(qrObject); // Добавляем в начало
    saveToLocalStorage();
    
    // Генерируем настоящий QR-код
    generateRealQRCode(qrObject);
    
    showNotification('QR-код сохранен', 'success');
    playSuccessSound();
    
    // Мигание для обратной связи (сканирование продолжается!)
    const readerDiv = document.getElementById('generic-reader');
    if (readerDiv) {
        const originalColor = readerDiv.style.borderColor;
        readerDiv.style.border = "3px solid #00FF00";
        setTimeout(() => {
            if (isScanning) readerDiv.style.border = "3px solid #2196F3";
        }, 300);
    }
}

function onGenericScanError(error) {
    // Игнорируем ошибки поиска кода
    if (!error.includes('NotFoundException') && !error.includes('No QR code')) {
        console.log('Ошибка сканирования (шк):', error);
    }
}

// ==================== ГЕНЕРАЦИЯ НАСТОЯЩИХ QR-КОДОВ ====================
function generateRealQRCode(qrObject) {
    const gallery = document.getElementById('qrcode-gallery');
    if (!gallery) return;
    
    // Создаем карточку
    const card = document.createElement('div');
    card.className = 'qr-card';
    card.dataset.id = qrObject.id;
    
    // Создаем canvas для QR-кода
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    canvas.className = 'qr-canvas';
    
    // Используем библиотеку QRCode для генерации
    // Проверяем, доступна ли библиотека
    if (typeof QRCode === 'undefined') {
        // Если библиотека не загружена, показываем заглушку
        createFallbackQR(canvas, qrObject.text);
    } else {
        // Генерируем настоящий QR-код
        try {
            QRCode.toCanvas(canvas, qrObject.text, {
                width: 120,
                margin: 1,
                color: {
                    dark: document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000',
                    light: '#00000000'
                }
            }, function(error) {
                if (error) {
                    console.error('Ошибка генерации QR:', error);
                    createFallbackQR(canvas, qrObject.text);
                }
            });
        } catch (error) {
            console.error('Ошибка генерации QR:', error);
            createFallbackQR(canvas, qrObject.text);
        }
    }
    
    // Создаем элементы карточки
    const img = document.createElement('img');
    img.src = canvas.toDataURL();
    img.alt = 'QR Code';
    img.className = 'qr-image';
    
    const textContainer = document.createElement('div');
    textContainer.className = 'qr-text';
    
    const textPreview = document.createElement('p');
    textPreview.textContent = truncateText(qrObject.text, 20);
    textPreview.title = qrObject.text;
    
    const dateInfo = document.createElement('small');
    dateInfo.textContent = qrObject.dateDisplay.split(',')[0];
    dateInfo.className = 'qr-date';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-qr-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Удалить QR-код';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteQRCode(qrObject.id);
    };
    
    // Клик по карточке для просмотра деталей
    card.addEventListener('click', () => {
        showQRDetails(qrObject);
    });
    
    // Собираем карточку
    textContainer.appendChild(textPreview);
    textContainer.appendChild(dateInfo);
    
    card.appendChild(deleteBtn);
    card.appendChild(img);
    card.appendChild(textContainer);
    
    // Добавляем с анимацией
    card.style.opacity = '0';
    card.style.transform = 'scale(0.8)';
    gallery.prepend(card);
    
    setTimeout(() => {
        card.style.transition = 'all 0.3s ease';
        card.style.opacity = '1';
        card.style.transform = 'scale(1)';
    }, 10);
}

function createFallbackQR(canvas, text) {
    const ctx = canvas.getContext('2d');
    
    // Фон
    ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#2d2d2d' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Простой QR-паттерн
    ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000';
    
    // Угловые маркеры
    ctx.fillRect(10, 10, 25, 25);
    ctx.fillRect(canvas.width - 35, 10, 25, 25);
    ctx.fillRect(10, canvas.height - 35, 25, 25);
    
    // Текст
    ctx.fillStyle = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('QR', canvas.width/2, canvas.height/2);
    
    ctx.font = '8px Arial';
    ctx.fillText('код', canvas.width/2, canvas.height/2 + 10);
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// ==================== ИМПОРТ/ЭКСПОРТ ДАННЫХ ====================
function initImportExport() {
    const importBtn = document.getElementById('importBtn');
    const exportAllBtn = document.getElementById('exportAllBtn');
    const importFile = document.getElementById('importFile');
    
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            importFile.click();
        });
    }
    
    if (exportAllBtn) {
        exportAllBtn.addEventListener('click', exportAllData);
    }
    
    if (importFile) {
        importFile.addEventListener('change', handleImportFile);
    }
}

function exportAllData() {
    const data = {
        transfers: state.transferData,
        qrCodes: state.qrCodes,
        exportDate: new Date().toISOString(),
        app: 'KBT Utilities'
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `kbt_data_${new Date().toISOString().slice(0, 10)}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showNotification('Все данные экспортированы', 'success');
}

function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // Проверяем формат
            if (!importedData.transfers || !importedData.qrCodes) {
                throw new Error('Неверный формат файла');
            }
            
            // Спрашиваем подтверждение
            if (confirm(`Импортировать ${importedData.transfers.length} передач и ${importedData.qrCodes.length} QR-кодов?`)) {
                // Можно объединить или заменить
                const action = confirm('Заменить текущие данные? (OK - заменить, Отмена - добавить к существующим)')
                    ? 'replace'
                    : 'merge';
                
                if (action === 'replace') {
                    state.transferData = importedData.transfers;
                    state.qrCodes = importedData.qrCodes;
                } else {
                    // Объединяем, избегая дубликатов
                    const existingNumbers = new Set(state.transferData.map(t => t.number));
                    const existingQRTexts = new Set(state.qrCodes.map(q => q.text));
                    
                    importedData.transfers.forEach(transfer => {
                        if (!existingNumbers.has(transfer.number)) {
                            state.transferData.push(transfer);
                        }
                    });
                    
                    importedData.qrCodes.forEach(qr => {
                        if (!existingQRTexts.has(qr.text)) {
                            state.qrCodes.push(qr);
                        }
                    });
                }
                
                saveToLocalStorage();
                sortTransferData();
                renderTransferHistory();
                renderQRCodesGallery();
                
                showNotification(`Импортировано: ${importedData.transfers.length} передач, ${importedData.qrCodes.length} QR-кодов`, 'success');
            }
        } catch (error) {
            console.error('Ошибка импорта:', error);
            showNotification('Ошибка импорта файла', 'error');
        }
        
        // Сбрасываем input
        event.target.value = '';
    };
    
    reader.readAsText(file);
}

// ==================== СОРТИРОВКА ПЕРЕДАЧ ПО ДАТЕ ====================
function sortTransferData() {
    state.transferData.sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
    });
}

// ==================== РЕНДЕРИНГ ИСТОРИИ ПЕРЕДАЧ С СОРТИРОВКОЙ ====================
function renderTransferHistory() {
    const list = document.getElementById('transfer-history');
    if (!list) return;
    
    // Сортируем перед отображением
    sortTransferData();
    
    if (state.transferData.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📦</div>
                <p>Нет отсканированных передач</p>
                <p style="font-size: 0.9rem; opacity: 0.7;">Отсканируйте QR-коды в формате $1:1:XXXXXXXXXX:</p>
            </div>
        `;
        return;
    }
    
    list.innerHTML = '';
    
    // Создаем таблицу для лучшего отображения
    const table = document.createElement('table');
    table.className = 'transfers-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>№</th>
                <th>Номер передачи</th>
                <th>Дата сканирования</th>
                <th>Действия</th>
            </tr>
        </thead>
        <tbody id="transfers-tbody"></tbody>
    `;
    
    list.appendChild(table);
    const tbody = document.getElementById('transfers-tbody');
    
    state.transferData.forEach((item, index) => {
        const row = document.createElement('tr');
        row.dataset.id = item.id;
        
        const date = new Date(item.timestamp);
        const formattedDate = date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td class="transfer-number-cell">
                <span class="transfer-number">${item.number}</span>
            </td>
            <td class="transfer-date-cell">
                <span class="transfer-date">${formattedDate}</span>
            </td>
            <td class="transfer-actions-cell">
                <button class="copy-transfer-btn" title="Копировать номер">
                    📋
                </button>
                <button class="delete-transfer-btn" title="Удалить запись">
                    🗑
                </button>
            </td>
        `;
        
        // Копирование номера
        const copyBtn = row.querySelector('.copy-transfer-btn');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(item.number).then(() => {
                showNotification('Номер скопирован', 'info');
            });
        });
        
        // Удаление записи
        const deleteBtn = row.querySelector('.delete-transfer-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTransfer(item.id);
        });
        
        tbody.appendChild(row);
    });
}

// ==================== РЕНДЕРИНГ QR-КОДОВ ====================
function renderQRCodesGallery() {
    const gallery = document.getElementById('qrcode-gallery');
    if (!gallery) return;
    
    gallery.innerHTML = '';
    
    if (state.qrCodes.length === 0) {
        gallery.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📷</div>
                <p>Нет сохраненных QR-кодов</p>
                <p style="font-size: 0.9rem; opacity: 0.7;">Отсканируйте QR-коды в режиме "Сканер шк"</p>
            </div>
        `;
        return;
    }
    
    // Отображаем все QR-коды
    state.qrCodes.forEach(qr => {
        generateRealQRCode(qr);
    });
}

// ==================== УДАЛЕНИЕ ДАННЫХ ====================
function deleteTransfer(id) {
    const item = state.transferData.find(t => t.id === id);
    if (!item) return;
    
    if (confirm(`Удалить передачу ${item.number}?`)) {
        state.transferData = state.transferData.filter(t => t.id !== id);
        saveToLocalStorage();
        renderTransferHistory();
        showNotification('Передача удалена', 'info');
    }
}

function deleteQRCode(id) {
    if (!confirm('Удалить этот QR-код?')) return;
    
    const card = document.querySelector(`.qr-card[data-id="${id}"]`);
    if (card) {
        card.style.transform = 'scale(0.8)';
        card.style.opacity = '0';
        
        setTimeout(() => {
            state.qrCodes = state.qrCodes.filter(qr => qr.id !== id);
            saveToLocalStorage();
            
            if (card.parentNode) {
                card.parentNode.removeChild(card);
            }
            
            // Если галерея пуста, показываем состояние
            if (state.qrCodes.length === 0) {
                renderQRCodesGallery();
            }
            
            showNotification('QR-код удален', 'info');
        }, 300);
    }
}

// ==================== ЭКСПОРТ CSV ====================
function initExportButtons() {
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToCSV);
    }
}

function exportToCSV() {
    if (state.transferData.length === 0) {
        showNotification('Нет данных для экспорта', 'warning');
        return;
    }
    
    let csvContent = 'ID,Номер передачи,Дата сканирования\n';
    
    state.transferData.forEach((item, index) => {
        const date = new Date(item.timestamp);
        const formattedDate = date.toLocaleString('ru-RU');
        csvContent += `${index + 1},${item.number},"${formattedDate}"\n`;
    });
    
    const blob = new Blob(['\ufeff' + csvContent], {
        type: 'text/csv;charset=utf-8;'
    });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const dateStr = new Date().toISOString().slice(0, 10);
    link.download = `kbt_transfers_${dateStr}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showNotification(`Экспортировано ${state.transferData.length} записей`, 'success');
}

// ==================== КНОПКИ ОЧИСТКИ ====================
function initClearButtons() {
    const clearTransfersBtn = document.getElementById('clearTransfersBtn');
    const clearQRCodesBtn = document.getElementById('clearQRCodesBtn');
    
    if (clearTransfersBtn) {
        clearTransfersBtn.addEventListener('click', clearTransferData);
    }
    
    if (clearQRCodesBtn) {
        clearQRCodesBtn.addEventListener('click', clearQRCodeData);
    }
}

function clearTransferData() {
    if (state.transferData.length === 0) {
        showNotification('Нет данных для очистки', 'warning');
        return;
    }
    
    if (confirm(`Очистить все передачи (${state.transferData.length} записей)?`)) {
        state.transferData = [];
        saveToLocalStorage();
        renderTransferHistory();
        showNotification('Данные передач очищены', 'success');
    }
}

function clearQRCodeData() {
    if (state.qrCodes.length === 0) {
        showNotification('Нет QR-кодов для очистки', 'warning');
        return;
    }
    
    if (confirm(`Удалить все QR-коды (${state.qrCodes.length} шт.)?`)) {
        state.qrCodes = [];
        saveToLocalStorage();
        renderQRCodesGallery();
        showNotification('QR-коды очищены', 'success');
    }
}

// ==================== LOCALSTORAGE ====================
function loadFromLocalStorage() {
    try {
        const savedTransfers = localStorage.getItem('kbt_transfers');
        const savedQRCodes = localStorage.getItem('kbt_qrcodes');
        
        if (savedTransfers) {
            const parsed = JSON.parse(savedTransfers);
            // Преобразуем старый формат (массив строк) в новый (массив объектов)
            if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
                state.transferData = parsed.map((number, index) => ({
                    id: Date.now() - index,
                    number: number,
                    timestamp: new Date().toISOString(),
                    dateDisplay: new Date().toLocaleString('ru-RU'),
                    date: new Date()
                }));
                saveToLocalStorage(); // Сохраняем в новом формате
            } else {
                state.transferData = parsed;
            }
        }
        
        if (savedQRCodes) {
            state.qrCodes = JSON.parse(savedQRCodes);
        }
        
        console.log('Данные загружены из localStorage');
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        state.transferData = [];
        state.qrCodes = [];
    }
}

function saveToLocalStorage() {
    try {
        localStorage.setItem('kbt_transfers', JSON.stringify(state.transferData));
        localStorage.setItem('kbt_qrcodes', JSON.stringify(state.qrCodes));
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showNotification('Ошибка сохранения данных', 'error');
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function stopActiveScanner() {
    if (activeScanner && isScanning) {
        activeScanner.stop().then(() => {
            isScanning = false;
            activeScanner = null;
            console.log('Сканер остановлен');
        }).catch(err => {
            console.error('Ошибка остановки сканера:', err);
            isScanning = false;
            activeScanner = null;
        });
    }
}

function showNotification(message, type = 'info') {
    // Удаляем старые уведомления
    const oldNotifications = document.querySelectorAll('.notification');
    oldNotifications.forEach(n => {
        if (n.parentNode) n.parentNode.removeChild(n);
    });
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Автоудаление через 3 секунды
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

function playSuccessSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        // Игнорируем ошибки звука
    }
}

function playErrorSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 400;
        oscillator.type = 'sawtooth';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        // Игнорируем ошибки звука
    }
}

// ==================== ИНИЦИАЛИЗАЦИЯ СТИЛЕЙ ====================
function initStyles() {
    const styles = document.createElement('style');
    styles.textContent = `
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 24px;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 300px;
        }
        
        .notification.success {
            background: linear-gradient(135deg, #4CAF50, #45a049);
        }
        
        .notification.error {
            background: linear-gradient(135deg, #f44336, #d32f2f);
        }
        
        .notification.warning {
            background: linear-gradient(135deg, #ff9800, #f57c00);
        }
        
        .notification.info {
            background: linear-gradient(135deg, #2196F3, #1976D2);
        }
        
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        .empty-state {
            grid-column: 1 / -1;
            text-align: center;
            padding: 3rem 1rem;
            color: var(--text-secondary);
        }
        
        .transfers-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
        }
        
        .transfers-table th {
            background: var(--bg-primary);
            padding: 0.8rem;
            text-align: left;
            border-bottom: 2px solid var(--accent-color);
            color: var(--text-primary);
            font-weight: 600;
        }
        
        .transfers-table td {
            padding: 0.8rem;
            border-bottom: 1px solid var(--border-color);
        }
        
        .transfers-table tr:hover {
            background: var(--bg-primary);
        }
        
        .transfer-number-cell {
            font-family: 'Courier New', monospace;
            font-weight: bold;
        }
        
        .transfer-date-cell {
            font-size: 0.9rem;
            color: var(--text-secondary);
        }
        
        .transfer-actions-cell {
            display: flex;
            gap: 0.5rem;
        }
        
        .copy-transfer-btn,
        .delete-transfer-btn {
            background: none;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 0.3rem 0.6rem;
            cursor: pointer;
            font-size: 0.9rem;
        }
        
        .copy-transfer-btn:hover {
            background: var(--accent-color);
            color: white;
        }
        
        .delete-transfer-btn:hover {
            background: #f44336;
            color: white;
        }
    `;
    document.head.appendChild(styles);
}

// Инициализируем стили при загрузке
initStyles();

// ==================== ОБРАБОТЧИКИ ОШИБОК ====================
window.addEventListener('error', function(event) {
    console.error('Глобальная ошибка:', event.error);
});

window.addEventListener('beforeunload', function() {
    stopActiveScanner();
});

console.log('KBT Utilities инициализирован');
