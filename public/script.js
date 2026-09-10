/* ===================================================
   VENTURE 26 — Shared Timer Client
   
   • Fetches the shared end-time from the server on load
   • Polls every 15 seconds to stay in sync
   • Admin code required to change the timer (verified server-side)
   • Per-digit tick animation + title jiggle + fullscreen
   =================================================== */

(function () {
    'use strict';

    // --- DOM refs ---
    const digits = {
        h1: document.getElementById('digit-h1'),
        h2: document.getElementById('digit-h2'),
        m1: document.getElementById('digit-m1'),
        m2: document.getElementById('digit-m2'),
        s1: document.getElementById('digit-s1'),
        s2: document.getElementById('digit-s2'),
    };

    const timerEl       = document.getElementById('timer');
    const fab           = document.getElementById('fab');
    const panel         = document.getElementById('panel');
    const backdrop      = document.getElementById('panel-backdrop');
    const tabs          = document.querySelectorAll('.tab');
    const paneDuration  = document.getElementById('pane-duration');
    const paneTarget    = document.getElementById('pane-target');
    const durH          = document.getElementById('dur-h');
    const durM          = document.getElementById('dur-m');
    const durS          = document.getElementById('dur-s');
    const inpDate       = document.getElementById('inp-date');
    const inpTime       = document.getElementById('inp-time');
    const btnCancel     = document.getElementById('btn-cancel');
    const btnStart      = document.getElementById('btn-start');

    // Auth gate
    const authGate      = document.getElementById('auth-gate');
    const timerControls = document.getElementById('timer-controls');
    const adminCodeInp  = document.getElementById('admin-code');
    const authError     = document.getElementById('auth-error');
    const btnUnlock     = document.getElementById('btn-unlock');
    const updateStatus  = document.getElementById('update-status');

    let intervalId  = null;
    let endTime     = null;        // epoch ms
    let clockOffset = 0;           // server time minus local time (ms)
    let activeMode  = 'duration';
    let adminCode   = '';          // stored after successful unlock

    const SYNC_INTERVAL = 15000;   // poll server every 15 seconds

    // --- Helpers ---
    function pad2(n) { return String(Math.max(0, n)).padStart(2, '0'); }

    function localDateStr(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    function localTimeStr(d) {
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }

    // --- Render digits ---
    function setDigits(hh, mm, ss) {
        const str = pad2(hh) + pad2(mm) + pad2(ss);
        const keys = ['h1','h2','m1','m2','s1','s2'];

        keys.forEach((key, i) => {
            const el = digits[key];
            const ch = str[i];
            if (el.textContent !== ch) {
                el.textContent = ch;
                el.classList.remove('tick');
                void el.offsetWidth;
                el.classList.add('tick');
                setTimeout(() => el.classList.remove('tick'), 350);
            }
        });
    }

    // --- Core countdown ---
    function tick() {
        if (!endTime) return;
        const now  = Date.now() + clockOffset;
        const diff = endTime - now;

        if (diff <= 0) {
            setDigits(0, 0, 0);
            timerEl.classList.add('finished');
            return;
        }

        timerEl.classList.remove('finished');

        const totalSec = Math.floor(diff / 1000);
        const hh = Math.floor(totalSec / 3600);
        const mm = Math.floor((totalSec % 3600) / 60);
        const ss = totalSec % 60;

        setDigits(hh, mm, ss);
    }

    function startLocalCountdown(serverEndTime) {
        endTime = serverEndTime;
        if (intervalId) clearInterval(intervalId);
        tick();
        intervalId = setInterval(tick, 1000);
    }

    // --- Server API ---
    async function fetchTimer() {
        try {
            const res = await fetch('/api/timer');
            if (!res.ok) throw new Error('Server error');
            const data = await res.json();

            // Calculate clock offset to handle devices with wrong system clocks
            clockOffset = data.serverNow - Date.now();

            startLocalCountdown(data.endTime);
        } catch (err) {
            console.warn('Could not reach server, using local fallback:', err);
            // Fallback: if we already have an endTime, keep going
            if (!endTime) {
                endTime = Date.now() + 16 * 3600 * 1000;
                startLocalCountdown(endTime);
            }
        }
    }

    async function updateTimer(newEndTime, code) {
        const res = await fetch('/api/timer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endTime: newEndTime, code })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed');
        return data;
    }

    // --- Panel open / close ---
    function openPanel() {
        // Reset auth gate on every open
        authGate.style.display = 'block';
        timerControls.style.display = 'none';
        adminCodeInp.value = '';
        authError.textContent = '';
        updateStatus.textContent = '';

        panel.classList.add('open');
        backdrop.classList.add('open');
        setTimeout(() => adminCodeInp.focus(), 400);
    }

    function closePanel() {
        panel.classList.remove('open');
        backdrop.classList.remove('open');
    }

    function prefillInputs() {
        if (endTime) {
            const now = Date.now() + clockOffset;
            const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
            durH.value = Math.floor(remaining / 3600);
            durM.value = Math.floor((remaining % 3600) / 60);
            durS.value = remaining % 60;

            const d = new Date(endTime);
            inpDate.value = localDateStr(d);
            inpTime.value = localTimeStr(d);
        } else {
            durH.value = 16; durM.value = 0; durS.value = 0;
            const def = new Date(Date.now() + 16 * 3600 * 1000);
            inpDate.value = localDateStr(def);
            inpTime.value = localTimeStr(def);
        }
    }

    // --- Unlock button (admin code verification) ---
    btnUnlock.addEventListener('click', async () => {
        const code = adminCodeInp.value.trim();
        if (!code) {
            authError.textContent = 'Please enter the admin code';
            return;
        }

        // Quick server-side verification of the code
        try {
            const res = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            if (!res.ok) {
                const data = await res.json();
                authError.textContent = data.error || 'Invalid code';
                return;
            }
        } catch {
            authError.textContent = 'Could not verify — check your connection';
            return;
        }

        // Code is valid
        adminCode = code;
        authGate.style.display = 'none';
        timerControls.style.display = 'block';
        prefillInputs();
    });

    // Enter key in code input triggers unlock
    adminCodeInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnUnlock.click();
    });

    // --- Tab switching ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            activeMode = tab.dataset.mode;

            paneDuration.classList.toggle('active', activeMode === 'duration');
            paneTarget.classList.toggle('active', activeMode === 'target');
        });
    });

    // --- Start / update button ---
    btnStart.addEventListener('click', async () => {
        let newEndTime;

        if (activeMode === 'duration') {
            const h = Math.max(0, parseInt(durH.value, 10) || 0);
            const m = Math.max(0, parseInt(durM.value, 10) || 0);
            const s = Math.max(0, parseInt(durS.value, 10) || 0);
            const totalMs = (h * 3600 + m * 60 + s) * 1000;
            if (totalMs <= 0) return;
            newEndTime = Date.now() + clockOffset + totalMs;
        } else {
            const dateVal = inpDate.value;
            const timeVal = inpTime.value;
            if (!dateVal || !timeVal) return;
            newEndTime = new Date(dateVal + 'T' + timeVal).getTime();
            if (isNaN(newEndTime) || newEndTime <= Date.now()) return;
        }

        try {
            updateStatus.textContent = 'Updating…';
            updateStatus.classList.remove('error');
            await updateTimer(newEndTime, adminCode);
            startLocalCountdown(newEndTime);
            updateStatus.textContent = '✓ Timer updated for all viewers!';
            setTimeout(() => closePanel(), 1200);
        } catch (err) {
            updateStatus.textContent = err.message;
            updateStatus.classList.add('error');
        }
    });

    // --- Wire up UI ---
    fab.addEventListener('click', openPanel);
    btnCancel.addEventListener('click', closePanel);
    backdrop.addEventListener('click', closePanel);

    // Escape key closes panel
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('open')) {
            closePanel();
        }
    });

    // --- Jiggle animation (wave through characters, repeating) ---
    (function initJiggle() {
        const chars = document.querySelectorAll('#title-main .char:not(.spacer)');
        const DELAY_PER_CHAR = 80;
        const PAUSE_BETWEEN  = 3000;
        const ANIM_DURATION  = 500;

        function wave() {
            chars.forEach((ch, i) => {
                setTimeout(() => {
                    ch.classList.remove('jiggle');
                    void ch.offsetWidth;
                    ch.classList.add('jiggle');
                    ch.addEventListener('animationend', function handler() {
                        ch.classList.remove('jiggle');
                        ch.removeEventListener('animationend', handler);
                    });
                }, i * DELAY_PER_CHAR);
            });

            const totalWaveTime = chars.length * DELAY_PER_CHAR + ANIM_DURATION;
            setTimeout(wave, totalWaveTime + PAUSE_BETWEEN);
        }

        setTimeout(wave, 1200);
    })();

    // --- Fullscreen toggle ---
    (function initFullscreen() {
        const fsBtn      = document.getElementById('fab-fs');
        const iconExpand = document.getElementById('fs-icon-expand');
        const iconShrink = document.getElementById('fs-icon-shrink');

        function updateIcon() {
            const isFs = !!document.fullscreenElement;
            iconExpand.style.display = isFs ? 'none' : 'block';
            iconShrink.style.display = isFs ? 'block' : 'none';
        }

        fsBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
            } else {
                document.exitFullscreen().catch(() => {});
            }
        });

        document.addEventListener('fullscreenchange', updateIcon);
    })();

    // --- Boot ---
    fetchTimer();

    // Keep polling the server to stay in sync
    setInterval(fetchTimer, SYNC_INTERVAL);
})();
