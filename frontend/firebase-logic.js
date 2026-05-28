 import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
    import { getFirestore, collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp, onSnapshot, deleteDoc, writeBatch, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
    import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

    const firebaseConfig = {
  apiKey: "AIzaSyCHpQu8po8ww50PHN6BdfMrUVtAXBnmwzo",
  authDomain: "smart-route-8ff6a.firebaseapp.com",
  projectId: "smart-route-8ff6a",
  storageBucket: "smart-route-8ff6a.firebasestorage.app",
  messagingSenderId: "610410290985",
  appId: "1:610410290985:web:e59962bd9b42d935bda138",
  measurementId: "G-4CZX8SNDBD"
};

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();

    let currentUser = { uid: null, email: null, name: null, role: null, user_id: null };
    let courierDocId = null;
    let courierIsActive = false;
    let pendingOrder = null;
    let currentDeliveryOrder = null;
    let mapInstance = null;

    async function geocodeAddress(address) {
        try { const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`); const data = await res.json(); if(data.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }; } catch(e) {}
        return { lat: 55.751244, lng: 37.618423 };
    }
    
    async function showAddressOnMap(address) {
        if(!mapInstance && document.getElementById('courierMap')) { 
            mapInstance = L.map('courierMap').setView([55.751244, 37.618423], 13); 
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© OSM' }).addTo(mapInstance); 
        }
        if(mapInstance) {
            const coords = await geocodeAddress(address);
            mapInstance.setView([coords.lat, coords.lng], 15);
            L.marker([coords.lat, coords.lng]).addTo(mapInstance).bindPopup(address).openPopup();
        }
    }

    function formatDateTime(dateTimeStr) {
        if(!dateTimeStr) return '';
        return new Date(dateTimeStr).toLocaleString('ru-RU', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    }

    function updateShiftUI() {
        const statusSpan = document.getElementById('shiftStatus');
        const toggleBtn = document.getElementById('toggleShiftBtn');
        if (!statusSpan || !toggleBtn) return;
        
        if (courierIsActive) {
            statusSpan.innerHTML = '✅ На смене';
            statusSpan.className = 'text-emerald-400 font-bold';
            toggleBtn.innerHTML = '🏁 Завершить смену';
            toggleBtn.classList.remove('bg-emerald-600');
            toggleBtn.classList.add('bg-red-600');
            toggleBtn.disabled = false;
        } else {
            statusSpan.innerHTML = '❌ Не в смене';
            statusSpan.className = 'text-red-400 font-bold';
            toggleBtn.innerHTML = '🚀 Выйти на смену';
            toggleBtn.classList.remove('bg-red-600');
            toggleBtn.classList.add('bg-emerald-600');
            toggleBtn.disabled = false;
        }
    }

    async function toggleShift() {
        if (!courierDocId) {
            alert("Ошибка: данные курьера не загружены.");
            return;
        }
        
        const toggleBtn = document.getElementById('toggleShiftBtn');
        if (toggleBtn) toggleBtn.disabled = true;
        
        try {
            if (courierIsActive) {
                await updateDoc(doc(db, "couriers", courierDocId), { is_active: false });
                courierIsActive = false;
                alert("✅ Смена завершена");
            } else {
                await updateDoc(doc(db, "couriers", courierDocId), { is_active: true });
                courierIsActive = true;
                alert("✅ Вы вышли на смену! Теперь вам будут приходить заказы.");
            }
            updateShiftUI();
        } catch (error) {
            console.error("Ошибка при переключении смены:", error);
            alert("Ошибка: " + error.message);
        } finally {
            if (toggleBtn) toggleBtn.disabled = false;
        }
    }

    // ========== УДАЛЕНИЕ АККАУНТА ==========
    async function deleteAccount() {
        if (!currentUser.uid) return;
        const confirmModal = document.getElementById('confirmDeleteModal');
        if (confirmModal) confirmModal.classList.remove('hidden');
    }
    
    async function performDeleteAccount() {
        const confirmModal = document.getElementById('confirmDeleteModal');
        if (confirmModal) confirmModal.classList.add('hidden');
        
        try {
            const usersQuery = query(collection(db, "users"), where("google_id", "==", currentUser.uid));
            const usersSnap = await getDocs(usersQuery);
            
            if (!usersSnap.empty) {
                const userDoc = usersSnap.docs[0];
                const userId = userDoc.id;
                
                if (currentUser.role === 'курьер') {
                    const couriersQuery = query(collection(db, "couriers"), where("user_id", "==", userId));
                    const couriersSnap = await getDocs(couriersQuery);
                    
                    if (!couriersSnap.empty) {
                        const courierId = couriersSnap.docs[0].id;
                        const ordersQuery = query(collection(db, "orders"), where("courier_id", "==", courierId));
                        const ordersSnap = await getDocs(ordersQuery);
                        const batch = writeBatch(db);
                        ordersSnap.forEach(orderDoc => {
                            batch.update(doc(db, "orders", orderDoc.id), { courier_id: null });
                        });
                        await batch.commit();
                        await deleteDoc(doc(db, "couriers", courierId));
                    }
                }
                await deleteDoc(doc(db, "users", userId));
            }
            
            await signOut(auth);
            currentUser = { uid: null, email: null, name: null, role: null, user_id: null };
            courierDocId = null;
            document.getElementById('dispatcherPanel').classList.add('hidden');
            document.getElementById('courierPanel').classList.add('hidden');
            document.getElementById('deleteAccountBtn').classList.add('hidden');
            document.getElementById('googleLoginBtn').innerHTML = `<i class="fab fa-google"></i> Войти`;
            alert("✅ Аккаунт успешно удалён из Firebase.");
        } catch (error) {
            console.error("Ошибка при удалении аккаунта:", error);
            alert("Ошибка при удалении: " + error.message);
        }
    }

    // Авторизация
    const loginBtn = document.getElementById('googleLoginBtn');
    loginBtn.onclick = () => signInWithPopup(auth, provider);
    
    onAuthStateChanged(auth, async (user) => {
        if(user) {
            currentUser.uid = user.uid; 
            currentUser.email = user.email; 
            currentUser.name = user.displayName;
            loginBtn.innerHTML = `<i class="fas fa-sign-out-alt"></i> ${user.displayName.split(' ')[0]}`;
            const deleteBtn = document.getElementById('deleteAccountBtn');
            if (deleteBtn) deleteBtn.classList.remove('hidden');
            
            const q = query(collection(db, "users"), where("google_id", "==", user.uid));
            const snap = await getDocs(q);
            
            if(snap.empty) {
                document.getElementById('roleModal').classList.remove('hidden');
            } else { 
                const data = snap.docs[0].data(); 
                currentUser.role = data.role; 
                currentUser.user_id = snap.docs[0].id; 
                initUI(); 
            }
        } else { 
            loginBtn.innerHTML = `<i class="fab fa-google"></i> Войти`;
            document.getElementById('dispatcherPanel').classList.add('hidden');
            document.getElementById('courierPanel').classList.add('hidden');
            document.getElementById('deleteAccountBtn').classList.add('hidden');
        }
    });
    
    window.pickRole = async (role) => {
        const userRef = await addDoc(collection(db, "users"), { 
            google_id: currentUser.uid, 
            email: currentUser.email, 
            name: currentUser.name, 
            role: role, 
            created_at: serverTimestamp() 
        });
        currentUser.user_id = userRef.id;
        if(role === 'курьер') {
            document.getElementById('courierVehicleModal').classList.remove('hidden');
        } else { 
            currentUser.role = role; 
            initUI(); 
        }
    };
    
    document.getElementById('chooseDispatcher').onclick = () => pickRole('диспетчер');
    document.getElementById('chooseCourier').onclick = () => pickRole('курьер');
    
    document.getElementById('saveVehicleBtn').onclick = async () => {
        const vehicle = document.getElementById('vehicleSelect').value;
        await addDoc(collection(db, "couriers"), { 
            user_id: currentUser.user_id, 
            vehicle_type: vehicle, 
            is_active: false, 
            last_lat: 0, 
            last_lng: 0, 
            gps_updated_at: serverTimestamp() 
        });
        document.getElementById('courierVehicleModal').classList.add('hidden');
        currentUser.role = 'курьер';
        initUI();
    };
    
    function initUI() {
        document.getElementById('roleModal').classList.add('hidden');
        if(currentUser.role === 'диспетчер') {
            document.getElementById('dispatcherPanel').classList.remove('hidden');
            document.getElementById('courierPanel').classList.add('hidden');
            initDispatcher();
        } else {
            document.getElementById('dispatcherPanel').classList.add('hidden');
            document.getElementById('courierPanel').classList.remove('hidden');
            initCourier();
        }
    }

    // ========== ДИСПЕТЧЕР ==========
    async function initDispatcher() {
        onSnapshot(collection(db, "orders"), (snap) => { 
            let total=0, completed=0; 
            snap.forEach(d => { 
                total++; 
                if(d.data().status==='выполнен') completed++; 
            }); 
            document.getElementById('statTotalOrders').innerText = total; 
            document.getElementById('statCompletedOrders').innerText = completed; 
            renderOrdersList(snap); 
        });
        
        onSnapshot(collection(db, "couriers"), async (snap) => { 
            let active=0; 
            const activeCouriers = [];
            for (const docSnap of snap.docs) { 
                if(docSnap.data().is_active===true) {
                    active++;
                    activeCouriers.push(docSnap);
                }
            } 
            document.getElementById('statActiveCouriers').innerText = active; 
            await renderCouriersList(activeCouriers); 
        });
    }
    
    function renderOrdersList(snapshot) {
        const container = document.getElementById('dispatcherOrdersList');
        let html = '';
        snapshot.forEach(docSnap => {
            const o = docSnap.data();
            const timeInfo = o.time_window_start ? `🕐 ${formatDateTime(o.time_window_start)} - ${formatDateTime(o.time_window_end)}` : '';
            html += `<div class="bg-slate-800/40 p-3 rounded-xl border border-slate-700"><div class="flex justify-between items-start"><div><div class="font-mono text-xs">#${docSnap.id.slice(-5)}</div><div class="text-sm font-medium mt-1">${o.address}</div><div class="text-xs text-slate-400 mt-1">📞 ${o.phone} | ⚖️ ${o.weight_kg || 0} кг | ${timeInfo}</div></div><div class="flex flex-col items-end gap-2"><span class="status-badge ${o.status==='новый'?'status-new':(o.status==='в работе'?'status-work':(o.status==='выполнен'?'status-done':'status-problem'))}">${o.status}</span><button onclick="window.deleteOrder('${docSnap.id}')" class="text-red-400 hover:text-red-300 text-xs bg-red-500/20 px-2 py-1 rounded-lg"><i class="fas fa-trash-alt"></i> Удалить</button></div></div></div>`;
        });
        container.innerHTML = html || '<div class="text-center py-8 text-slate-500">Нет заказов</div>';
    }
    
    window.deleteOrder = async (id) => { 
        if(confirm("Удалить заказ?")) await deleteDoc(doc(db, "orders", id)); 
    };
    
    async function renderCouriersList(activeCouriers) {
        const container = document.getElementById('dispatcherCouriersList');
        let html = '';
        if (activeCouriers.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-slate-500 col-span-2">Нет активных курьеров</div>';
            return;
        }
        for (const docSnap of activeCouriers) {
            const c = docSnap.data();
            const userSnap = await getDoc(doc(db, "users", c.user_id));
            const userName = userSnap.exists() ? userSnap.data().name : 'Курьер';
            html += `<div class="bg-slate-800/30 p-2 rounded-xl flex justify-between items-center"><span><i class="fas fa-user-circle text-purple-400"></i> ${userName} (${c.vehicle_type})</span><span class="text-emerald-400 text-xs">● НА СМЕНЕ</span></div>`;
        }
        container.innerHTML = html;
    }
    
    document.getElementById('newOrderDispatcherBtn').onclick = () => document.getElementById('orderFormModal').classList.remove('hidden');
    document.getElementById('closeOrderModal').onclick = () => document.getElementById('orderFormModal').classList.add('hidden');
    
    document.getElementById('saveOrderFinalBtn').onclick = async () => {
        const addr = document.getElementById('orderAddress').value, phone = document.getElementById('orderPhone').value;
        if(!addr || !phone) return alert("Заполните адрес и телефон");
        const coords = await geocodeAddress(addr);
        await addDoc(collection(db, "orders"), { 
            address: addr, lat: coords.lat, lng: coords.lng, phone: phone, 
            weight_kg: parseFloat(document.getElementById('orderWeight').value)||0, 
            time_window_start: document.getElementById('orderTimeStart').value, 
            time_window_end: document.getElementById('orderTimeEnd').value, 
            status: 'новый', created_at: serverTimestamp() 
        });
        document.getElementById('orderFormModal').classList.add('hidden');
        document.getElementById('orderAddress').value=''; 
        document.getElementById('orderPhone').value=''; 
        document.getElementById('orderWeight').value='';
        document.getElementById('orderTimeStart').value=''; 
        document.getElementById('orderTimeEnd').value='';
        
        // Создаём отчёт за сегодня
        const today = new Date().toISOString().split('T')[0];
        const reportsQuery = query(collection(db, "reports"), where("date", "==", today));
        const existingReports = await getDocs(reportsQuery);
        if (existingReports.empty) {
            await addDoc(collection(db, "reports"), {
                date: today,
                total_orders: 0,
                avg_delivery_time_min: 0,
                fuel_saved_percent: 15,
                created_at: serverTimestamp()
            });
        }
    };
    
    document.getElementById('runOptimizationBtn').onclick = async () => {
        const newOrdersSnap = await getDocs(query(collection(db,"orders"), where("status","==","новый")));
        const activeCourSnap = await getDocs(query(collection(db,"couriers"), where("is_active","==",true)));
        if(newOrdersSnap.empty) return alert("Нет новых заказов");
        if(activeCourSnap.empty) return alert("Нет активных курьеров");
        const courierIds = activeCourSnap.docs.map(d=>d.id);
        let idx=0; 
        const batch = writeBatch(db);
        const today = new Date().toISOString().split('T')[0];
        
        for(const docSnap of newOrdersSnap.docs){
            const courierId = courierIds[idx % courierIds.length];
            batch.update(doc(db,"orders",docSnap.id), { 
                status:'в работе', 
                courier_id: courierId, 
                assigned_at: serverTimestamp() 
            });
            
            // Создаём маршрут
            const routeRef = doc(collection(db, "routes"));
            batch.set(routeRef, {
                courier_id: courierId,
                date: today,
                total_km: Math.floor(Math.random() * 20) + 10,
                status: 'отправлен',
                created_at: serverTimestamp()
            });
            
            // Создаём точку маршрута
            const pointRef = doc(collection(db, "routePoints"));
            batch.set(pointRef, {
                route_id: routeRef.id,
                order_id: docSnap.id,
                sequence: idx + 1,
                created_at: serverTimestamp()
            });
            
            idx++;
        }
        await batch.commit();
        alert(`✅ Распределено ${newOrdersSnap.size} заказов`);
    };

    // ========== КУРЬЕР ==========
    async function initCourier() {
        const toggleBtn = document.getElementById('toggleShiftBtn');
        if (toggleBtn) {
            toggleBtn.disabled = true;
            toggleBtn.innerHTML = '⏳ Загрузка...';
        }
        
        try {
            const cSnap = await getDocs(query(collection(db,"couriers"), where("user_id","==",currentUser.user_id)));
            if(cSnap.empty) {
                if (toggleBtn) {
                    toggleBtn.disabled = false;
                    toggleBtn.innerHTML = '❌ Ошибка';
                }
                return;
            }
            
            const courierDoc = cSnap.docs[0];
            courierDocId = courierDoc.id;
            const courierData = courierDoc.data();
            courierIsActive = courierData.is_active === true;
            
            updateShiftUI();
            
            if (toggleBtn) {
                const newToggleBtn = toggleBtn.cloneNode(true);
                toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
                newToggleBtn.addEventListener('click', toggleShift);
                newToggleBtn.disabled = false;
            }
        } catch (error) {
            console.error("Ошибка загрузки данных курьера:", error);
            if (toggleBtn) {
                toggleBtn.disabled = false;
                toggleBtn.innerHTML = '🔄 Повторить';
            }
            return;
        }
        
        onSnapshot(query(collection(db,"orders"), where("courier_id","==",courierDocId)), (snap) => {
            const orders = [];
            let completed=0, accepted=0, declined=0;
            snap.forEach(d => { 
                const data = d.data(); 
                orders.push({id:d.id, ...data});
                if(data.status === 'выполнен') completed++;
                else if(data.status === 'отклонён') declined++;
                else if(data.status === 'доставка' || data.status === 'в работе') accepted++;
            });
            
            const completedEl = document.getElementById('courierCompletedCount');
            const acceptedEl = document.getElementById('courierAcceptedCount');
            const declinedEl = document.getElementById('courierDeclinedCount');
            if (completedEl) completedEl.innerText = completed;
            if (acceptedEl) acceptedEl.innerText = accepted;
            if (declinedEl) declinedEl.innerText = declined;
            
            if(!courierIsActive) {
                const waitBlock = document.getElementById('courierWaitBlock');
                const activeBlock = document.getElementById('courierActiveBlock');
                if (waitBlock) waitBlock.classList.remove('hidden');
                if (activeBlock) activeBlock.classList.add('hidden');
                return;
            }
            
            const pending = orders.find(o => o.status === 'в работе');
            const inDelivery = orders.find(o => o.status === 'доставка');
            
            const waitBlock = document.getElementById('courierWaitBlock');
            const activeBlock = document.getElementById('courierActiveBlock');
            const acceptBtns = document.getElementById('acceptDeclineButtons');
            const arrivalBtns = document.getElementById('arrivalButtons');
            const actionBtns = document.getElementById('actionButtons');
            const addressDisplay = document.getElementById('currentAddressDisplay');
            const timeDisplay = document.getElementById('orderTimeDisplay');
            const weightDisplay = document.getElementById('orderWeightDisplay');
            
            if(pending) {
                pendingOrder = pending;
                currentDeliveryOrder = null;
                if (waitBlock) waitBlock.classList.add('hidden');
                if (activeBlock) activeBlock.classList.remove('hidden');
                if (acceptBtns) acceptBtns.classList.remove('hidden');
                if (arrivalBtns) arrivalBtns.classList.add('hidden');
                if (actionBtns) actionBtns.classList.add('hidden');
                if (addressDisplay) addressDisplay.innerText = pending.address;
                if (timeDisplay) timeDisplay.innerHTML = pending.time_window_start ? `<i class="fas fa-clock mr-1"></i> ${formatDateTime(pending.time_window_start)} - ${formatDateTime(pending.time_window_end)}` : '';
                if (weightDisplay) weightDisplay.innerHTML = `<i class="fas fa-weight-hanging mr-1"></i> ${pending.weight_kg || 0} кг`;
                showAddressOnMap(pending.address);
            } else if(inDelivery) {
                currentDeliveryOrder = inDelivery;
                pendingOrder = null;
                if (waitBlock) waitBlock.classList.add('hidden');
                if (activeBlock) activeBlock.classList.remove('hidden');
                if (acceptBtns) acceptBtns.classList.add('hidden');
                if (arrivalBtns) arrivalBtns.classList.remove('hidden');
                if (actionBtns) actionBtns.classList.add('hidden');
                if (addressDisplay) addressDisplay.innerText = inDelivery.address;
                if (timeDisplay) timeDisplay.innerHTML = inDelivery.time_window_start ? `<i class="fas fa-clock mr-1"></i> ${formatDateTime(inDelivery.time_window_start)} - ${formatDateTime(inDelivery.time_window_end)}` : '';
                if (weightDisplay) weightDisplay.innerHTML = `<i class="fas fa-weight-hanging mr-1"></i> ${inDelivery.weight_kg || 0} кг`;
                showAddressOnMap(inDelivery.address);
            } else if(orders.length === 0 || (orders.filter(o => o.status === 'в работе' || o.status === 'доставка').length === 0)) {
                if (waitBlock) waitBlock.classList.remove('hidden');
                if (activeBlock) activeBlock.classList.add('hidden');
                pendingOrder = null;
                currentDeliveryOrder = null;
            }
            renderCourierHistory(orders);
        });
    }
    
    function renderCourierHistory(orders) {
        const container = document.getElementById('courierHistoryList');
        if (!container) return;
        let html = '';
        orders.slice(0, 15).forEach(o => {
            let statusText = '', statusColor = '';
            if(o.status === 'выполнен') { statusText = '✅ Выполнен'; statusColor = 'border-emerald-500'; }
            else if(o.status === 'отклонён') { statusText = '❌ Отклонён'; statusColor = 'border-red-500'; }
            else if(o.status === 'в работе') { statusText = '⏳ Ожидает решения'; statusColor = 'border-amber-500'; }
            else if(o.status === 'доставка') { statusText = '🚚 В доставке'; statusColor = 'border-blue-500'; }
            else { statusText = o.status; statusColor = 'border-slate-600'; }
            html += `<div class="history-card ${statusColor}"><div class="flex justify-between"><span class="text-xs font-mono">#${o.id.slice(-5)}</span><span class="text-xs">${statusText}</span></div><div class="text-sm mt-1">${o.address}</div><div class="text-xs text-slate-400">${o.weight_kg || 0} кг</div></div>`;
        });
        container.innerHTML = html || '<div class="text-center text-slate-500 py-4">История пуста</div>';
    }
    
    // Обработчики кнопок действий с заказами
    const acceptBtn = document.getElementById('acceptOrderBtn');
    if (acceptBtn) {
        acceptBtn.addEventListener('click', async () => {
            if(pendingOrder) {
                await updateDoc(doc(db, "orders", pendingOrder.id), { status: 'доставка', accepted_at: serverTimestamp() });
                // Обновляем точку маршрута
                const pointsSnap = await getDocs(query(collection(db, "routePoints"), where("order_id", "==", pendingOrder.id)));
                if (!pointsSnap.empty) {
                    await updateDoc(doc(db, "routePoints", pointsSnap.docs[0].id), { arrived_at: serverTimestamp() });
                }
                pendingOrder = null;
                alert("✅ Заказ принят! Отправляйтесь к месту доставки.");
            }
        });
    }
    
    const declineBtn = document.getElementById('declineOrderBtn');
    if (declineBtn) {
        declineBtn.addEventListener('click', async () => {
            if(pendingOrder) {
                const reason = prompt("Укажите причину отклонения:");
                await updateDoc(doc(db, "orders", pendingOrder.id), { status: 'отклонён', decline_reason: reason, declined_at: serverTimestamp() });
                pendingOrder = null;
                alert("❌ Заказ отклонён");
            }
        });
    }
    
    const arrivedBtn = document.getElementById('arrivedBtn');
    if (arrivedBtn) {
        arrivedBtn.addEventListener('click', async () => {
            const snap = await getDocs(query(collection(db,"orders"), where("courier_id","==",courierDocId), where("status","==","доставка")));
            if(!snap.empty) {
                currentDeliveryOrder = { id: snap.docs[0].id, ...snap.docs[0].data() };
                // Обновляем точку маршрута
                const pointsSnap = await getDocs(query(collection(db, "routePoints"), where("order_id", "==", currentDeliveryOrder.id)));
                if (!pointsSnap.empty) {
                    await updateDoc(doc(db, "routePoints", pointsSnap.docs[0].id), { arrived_at: serverTimestamp() });
                }
                const arrivalBtns = document.getElementById('arrivalButtons');
                const actionBtns = document.getElementById('actionButtons');
                if (arrivalBtns) arrivalBtns.classList.add('hidden');
                if (actionBtns) actionBtns.classList.remove('hidden');
            }
        });
    }
    
    const completeBtn = document.getElementById('completeDeliveryBtn');
    if (completeBtn) {
        completeBtn.addEventListener('click', async () => {
            const snap = await getDocs(query(collection(db,"orders"), where("courier_id","==",courierDocId), where("status","==","доставка")));
            if(!snap.empty) {
                await updateDoc(doc(db,"orders",snap.docs[0].id), { status:'выполнен', completed_at: serverTimestamp() });
                // Обновляем точку маршрута
                const pointsSnap = await getDocs(query(collection(db, "routePoints"), where("order_id", "==", snap.docs[0].id)));
                if (!pointsSnap.empty) {
                    await updateDoc(doc(db, "routePoints", pointsSnap.docs[0].id), { completed_at: serverTimestamp() });
                }
                const actionBtns = document.getElementById('actionButtons');
                if (actionBtns) actionBtns.classList.add('hidden');
                alert("✅ Доставка завершена!");
            }
        });
    }
    
    const problemBtn = document.getElementById('problemDeliveryBtn');
    if (problemBtn) {
        problemBtn.addEventListener('click', () => {
            document.getElementById('problemTextModal').classList.remove('hidden');
        });
    }
    
    const submitProblemBtn = document.getElementById('submitProblemBtn');
    if (submitProblemBtn) {
        submitProblemBtn.addEventListener('click', async () => {
            const note = document.getElementById('problemDesc').value;
            const snap = await getDocs(query(collection(db,"orders"), where("courier_id","==",courierDocId), where("status","==","доставка")));
            if(!snap.empty) {
                await updateDoc(doc(db,"orders",snap.docs[0].id), { status:'проблема', problem_note: note });
                const pointsSnap = await getDocs(query(collection(db, "routePoints"), where("order_id", "==", snap.docs[0].id)));
                if (!pointsSnap.empty) {
                    await updateDoc(doc(db, "routePoints", pointsSnap.docs[0].id), { problem_note: note });
                }
                document.getElementById('problemTextModal').classList.add('hidden');
                const actionBtns = document.getElementById('actionButtons');
                if (actionBtns) actionBtns.classList.add('hidden');
                alert("⚠️ Проблема отправлена диспетчеру");
            }
            const problemDesc = document.getElementById('problemDesc');
            if (problemDesc) problemDesc.value = '';
        });
    }
    
    // ========== КНОПКА УДАЛЕНИЯ АККАУНТА ==========
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', deleteAccount);
    }
    
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', performDeleteAccount);
    }
    
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            const modal = document.getElementById('confirmDeleteModal');
            if (modal) modal.classList.add('hidden');
        });
    }
