(function () {
    let defaultData = {
        columns: [
            {
                id: 'todo',
                title: 'To Do',
                color: '#e8a23d',
                prefix: 'TD',
                cards: []
            },
            {
                id: 'progress',
                title: 'In Progress',
                color: '#6c9bd1',
                prefix: 'IP',
                cards: []
            },
            {
                id: 'done',
                title: 'Done',
                color: '#6fa287',
                prefix: 'DN',
                cards: []
            }
        ]
    };

    let data = [];

    let counters = {};
    let draggedCard = null;
    let draggedFrom = null;
    let searchText = '';
    let filter = 'all';
    let highlightCard = null;

    let columns = document.querySelector('#columns');
    let stats = document.querySelector('#boardStats');
    let progressBar = document.querySelector('#progressFill');
    let search = document.querySelector('#searchInput');
    let chips = document.querySelector('#filterChips');
    let addBtn = document.querySelector('#addTaskBtn');
    let modalOverlay = document.querySelector('#modalOverlay');
    let modalTitle = document.querySelector('#modalTitle');
    let modalDesc = document.querySelector('#modalDescription');
    let modalPriority = document.querySelector('#modalPriority');
    let saveBtn = document.querySelector('#modalSave');
    let cancelBtn = document.querySelector('#modalCancel');

    function setupCounters() {
        counters = {};
        for (let col of data.columns) {
            let max = 0;
            for (let card of col.cards) {
                let num = parseInt(card.id.split('-')[1]);
                if (num > max) max = num;
            }
            counters[col.id] = max;
        }
    }

    function loadData() {
        let saved = localStorage.getItem('kanbanData');
        if (saved) {
            try {
                let parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object' && parsed.columns && Array.isArray(parsed.columns)) {
                    data = parsed;
                    return true;
                }
            } catch (e) {
                console.log('Error loading data:', e);
            }
        }
        return false;
    }

    function saveData() {
        localStorage.setItem('kanbanData', JSON.stringify(data));
    }

    function debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    }

    function findColumn(id) {
        return data.columns.find(c => c.id === id);
    }

    function showCard(card) {
        let matchSearch = !searchText ||
            card.title.toLowerCase().includes(searchText) ||
            (card.description && card.description.toLowerCase().includes(searchText)) ||
            card.id.toLowerCase().includes(searchText);

        let matchFilter = filter === 'all' || card.priority === filter;

        return matchSearch && matchFilter;
    }

    function addCard(colId, title, desc, priority) {
        let col = findColumn(colId);
        counters[colId] = (counters[colId] || 0) + 1;
        let id = col.prefix + '-' + String(counters[colId]).padStart(2, '0');
        col.cards.push({ id, title, description: desc, priority });
        saveData();
        render();
    }

    function deleteCard(colId, cardId) {
        let col = findColumn(colId);
        col.cards = col.cards.filter(c => c.id !== cardId);
        saveData();
        render();
    }

    function moveCard(fromCol, toCol, cardId) {
        let from = findColumn(fromCol);
        let to = findColumn(toCol);

        let index = from.cards.findIndex(c => c.id === cardId);
        if (index === -1) return;

        let card = from.cards.splice(index, 1)[0];
        to.cards.push(card);

        if (toCol === 'done') highlightCard = card.id;
        saveData();
        render();
    }

    let touchDrag = null;
    let autoScrollTimer = null;

    function startAutoScroll() {
        if (autoScrollTimer) return;
        autoScrollTimer = setInterval(function () {
            if (!touchDrag || !touchDrag.dragging || touchDrag.lastY == null) return;

            let edge = 70;
            let maxSpeed = 14;
            let y = touchDrag.lastY;

            if (y < edge) {
                let strength = (edge - y) / edge;
                window.scrollBy(0, -maxSpeed * strength);
            } else if (y > window.innerHeight - edge) {
                let strength = (y - (window.innerHeight - edge)) / edge;
                window.scrollBy(0, maxSpeed * strength);
            }
        }, 16);
    }

    function stopAutoScroll() {
        clearInterval(autoScrollTimer);
        autoScrollTimer = null;
    }

    function attachTouchHandlers(cardDiv, card, col) {
        cardDiv.addEventListener('touchstart', function (e) {
            let touch = e.touches[0];
            let rect = this.getBoundingClientRect();
            touchDrag = {
                el: this,
                cardId: card.id,
                fromCol: col.id,
                startX: touch.clientX,
                startY: touch.clientY,
                origX: rect.left,
                origY: rect.top,
                width: rect.width,
                height: rect.height,
                dragging: false
            };
        }, { passive: true });

        cardDiv.addEventListener('touchmove', function (e) {
            if (!touchDrag || touchDrag.el !== this) return;
            let touch = e.touches[0];
            let dx = touch.clientX - touchDrag.startX;
            let dy = touch.clientY - touchDrag.startY;

            if (!touchDrag.dragging) {
                if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
                touchDrag.dragging = true;
                touchDrag.el.classList.add('touch-dragging');
                touchDrag.el.style.width = touchDrag.width + 'px';
                touchDrag.el.style.left = touchDrag.origX + 'px';
                touchDrag.el.style.top = touchDrag.origY + 'px';
                document.body.appendChild(touchDrag.el);
            }

            e.preventDefault();
            touchDrag.el.style.left = (touchDrag.origX + dx) + 'px';
            touchDrag.el.style.top = (touchDrag.origY + dy) + 'px';

            document.querySelectorAll('.card-list').forEach(l => l.classList.remove('drag-over'));
            let elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
            let listUnder = elUnder ? elUnder.closest('.card-list') : null;
            if (listUnder) listUnder.classList.add('drag-over');
        }, { passive: false });

        cardDiv.addEventListener('touchend', function (e) {
            if (!touchDrag || touchDrag.el !== this) return;
            document.querySelectorAll('.card-list').forEach(l => l.classList.remove('drag-over'));

            if (touchDrag.dragging) {
                let touch = e.changedTouches[0];
                let elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
                let listUnder = elUnder ? elUnder.closest('.card-list') : null;
                let toCol = listUnder ? listUnder.dataset.col : null;
                let fromCol = touchDrag.fromCol;
                let cardId = touchDrag.cardId;

                touchDrag.el.remove();
                touchDrag = null;

                if (toCol) {
                    moveCard(fromCol, toCol, cardId);
                } else {
                    render();
                }
            } else {
                touchDrag = null;
            }
        });

        cardDiv.addEventListener('touchcancel', function () {
            if (touchDrag && touchDrag.el === this) {
                touchDrag.el.remove();
                touchDrag = null;
                render();
            }
        });
    }

    function render() {
        columns.innerHTML = '';
        let total = 0;
        let done = 0;

        for (let col of data.columns) {
            total += col.cards.length;
            if (col.id === 'done') done = col.cards.length;

            let colDiv = document.createElement('div');
            colDiv.className = 'column';
            colDiv.style.setProperty('--accent', col.color);

            colDiv.innerHTML = `
                <div class="column-head">
                    <div class="column-head-left">
                        <span class="dot"></span>
                        <h2>${col.title}</h2>
                    </div>
                    <span class="count-badge">${col.cards.length}</span>
                </div>
                <div class="card-list" data-col="${col.id}"></div>
            `;

            let list = colDiv.querySelector('.card-list');

            if (col.cards.length === 0) {
                let empty = document.createElement('div');
                empty.className = 'empty-state';
                if (col.id != "todo")
                    empty.textContent = 'Nothing here yet — drag a card over';
                else
                    empty.textContent = 'Nothing here yet — drag a card over or add a new task';
                list.appendChild(empty);
            }

            for (let card of col.cards) {
                let cardDiv = document.createElement('div');
                cardDiv.className = 'card';

                if (!showCard(card)) cardDiv.classList.add('filtered-out');
                if (highlightCard === card.id) cardDiv.classList.add('pulse');

                cardDiv.draggable = true;
                cardDiv.dataset.id = card.id;
                cardDiv.dataset.col = col.id;

                cardDiv.innerHTML = `
                    <p class="card-title">${card.title}</p>
                    ${card.description ? `<p class="card-description">${card.description}</p>` : ''}
                    <div class="card-foot">
                        <span class="priority ${card.priority}">${card.priority}</span>
                        <button class="card-del" title="Delete card">✕</button>
                    </div>
                `;

                cardDiv.addEventListener('dragstart', function (e) {
                    draggedCard = card.id;
                    draggedFrom = col.id;
                    this.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });

                cardDiv.addEventListener('dragend', function () {
                    this.classList.remove('dragging');
                });

                cardDiv.querySelector('.card-del').addEventListener('click', function () {
                    deleteCard(col.id, card.id);
                });

                attachTouchHandlers(cardDiv, card, col);

                list.appendChild(cardDiv);
            }

            list.addEventListener('dragover', function (e) {
                e.preventDefault();
                this.classList.add('drag-over');
            });

            list.addEventListener('dragleave', function () {
                this.classList.remove('drag-over');
            });

            list.addEventListener('drop', function (e) {
                e.preventDefault();
                this.classList.remove('drag-over');
                if (draggedCard && draggedFrom) {
                    moveCard(draggedFrom, col.id, draggedCard);
                    draggedCard = null;
                    draggedFrom = null;
                }
            });

            columns.appendChild(colDiv);
        }

        stats.innerHTML = `<span><b>${total}</b> total</span><span><b>${done}</b> done</span>`;
        let percent = total === 0 ? 0 : Math.round((done / total) * 100);
        progressBar.style.width = percent + '%';

        highlightCard = null;
    }

    function openModal() {
        modalTitle.value = '';
        modalDesc.value = '';
        modalPriority.value = 'med';
        modalOverlay.classList.remove('hidden');
        setTimeout(() => modalTitle.focus(), 0);
    }

    function closeModal() {
        modalOverlay.classList.add('hidden');
    }

    function saveModal() {
        let title = modalTitle.value.trim();
        if (!title) {
            modalTitle.focus();
            return;
        }
        addCard('todo', title, modalDesc.value.trim(), modalPriority.value);
        closeModal();
    }

    addBtn.addEventListener('click', openModal);
    cancelBtn.addEventListener('click', closeModal);
    saveBtn.addEventListener('click', saveModal);

    modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) closeModal();
    });

    document.addEventListener('keydown', function (e) {
        if (modalOverlay.classList.contains('hidden')) return;
        if (e.key === 'Escape') closeModal();
        if (e.key === 'Enter' && e.target !== modalDesc) saveModal();
    });


    search.addEventListener('input', debounce(function handleSearch(e) {
        searchText = e.target.value.trim().toLowerCase();
        render();
    }
        , 300));

    chips.addEventListener('click', function (e) {
        let btn = e.target.closest('.chip');
        if (!btn) return;
        filter = btn.dataset.filter;
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        render();
    });

    if (!loadData())
        data = JSON.parse(JSON.stringify(defaultData));
    setupCounters();
    render();
})();