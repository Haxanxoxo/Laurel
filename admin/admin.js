/* ===================================================
   Admin JavaScript — Laurel Lodge Administration
   Login + Dashboard logic · Firebase Auth & Firestore
   =================================================== */

(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Common helpers
  // -----------------------------------------------------------------------
  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dateKey(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function monthKey(y, m) { return y + '-' + pad(m + 1); }
  function parseDateUTC(str) {
    var p = str.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  }
  function formatDateDisplay(str) {
    var d = parseDateUTC(str);
    return d.getUTCDate() + ' ' + MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  function mondayIndex(y, m, d) {
    var day = new Date(Date.UTC(y, m, d)).getUTCDay();
    return (day + 6) % 7;
  }
  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  }

  var now = new Date();
  var MIN_YEAR  = now.getUTCFullYear();
  var MIN_MONTH = now.getUTCMonth();
  var MAX_YEAR  = MIN_YEAR + 5;
  var MAX_MONTH = MIN_MONTH;

  // -----------------------------------------------------------------------
  // API access helper
  // -----------------------------------------------------------------------
  function getAPI() {
    return window.AvailabilityAPI || null;
  }

  // -----------------------------------------------------------------------
  // LOGIN PAGE
  // -----------------------------------------------------------------------
  function initLogin() {
    var form     = document.getElementById('loginForm');
    var errorBox = document.getElementById('loginError');
    var btn      = document.getElementById('loginBtn');
    if (!form) return;

    var api = getAPI();
    if (api) {
      api.getSession().then(function(session) {
        if (session) window.location.href = 'dashboard.html';
      }).catch(function() {});
    }

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var email    = document.getElementById('loginEmail').value.trim();
      var password = document.getElementById('loginPassword').value;

      if (!email || !password) {
        showLoginError('Please enter both email and password.');
        return;
      }

      var api = getAPI();
      if (!api || !api.isConfigured()) {
        showLoginError('Firebase is not yet configured. Please update assets/js/firebase-config.js with your project credentials.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Signing in…';
      errorBox.classList.remove('visible');

      api.signIn(email, password).then(function() {
        window.location.href = 'dashboard.html';
      }).catch(function(err) {
        var msg = 'Invalid email or password.';
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          msg = 'Invalid email or password.';
        } else if (err.code === 'auth/too-many-requests') {
          msg = 'Too many failed login attempts. Please try again later.';
        } else if (err.message) {
          msg = err.message;
        }
        showLoginError(msg);
        btn.disabled = false;
        btn.textContent = 'Sign In';
      });
    });

    function showLoginError(msg) {
      errorBox.textContent = msg;
      errorBox.classList.add('visible');
    }
  }

  // -----------------------------------------------------------------------
  // DASHBOARD PAGE
  // -----------------------------------------------------------------------
  var currentYear, currentMonth;
  var selectedDates = new Set();
  var bookedDatesSet = new Set();
  var bookingsRaw = [];
  var lastClickedDate = null;
  var rangeMode = false;
  var rangeStart = null;

  function initDashboard() {
    var heading = document.getElementById('dashboardHeading');
    if (!heading) return;

    currentYear  = MIN_YEAR;
    currentMonth = MIN_MONTH;

    var api = getAPI();
    if (!api || !api.isConfigured()) {
      var content = document.querySelector('.admin-content');
      if (content) {
        content.insertAdjacentHTML('afterbegin',
          '<div style="background:#fff3cd; color:#856404; padding:1rem 1.25rem; border:1px solid #ffeeba; border-radius:4px; margin-bottom:1.5rem; font-size:0.9rem;">' +
          '<strong>Configuration Notice:</strong> Firebase credentials are currently set to placeholders in <code>assets/js/firebase-config.js</code>. ' +
          'Please configure your Firebase Project ID and Web API Key to enable live cloud synchronization.' +
          '</div>'
        );
      }
      setupDashboard();
      return;
    }

    api.getSession().then(function(session) {
      if (!session) {
        window.location.href = 'index.html';
        return;
      }
      setupDashboard();
    }).catch(function() {
      window.location.href = 'index.html';
    });
  }

  function setupDashboard() {
    var prevBtn = document.getElementById('adminCalPrev');
    var nextBtn = document.getElementById('adminCalNext');
    var bookBtn = document.getElementById('btnMarkBooked');
    var unbookBtn = document.getElementById('btnMarkAvailable');
    var clearBtn = document.getElementById('btnClearSelection');
    var signoutBtn = document.getElementById('btnSignOut');
    var rangeModeCheck = document.getElementById('rangeModeCheck');

    if (prevBtn) prevBtn.addEventListener('click', function() { navigateMonth(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function() { navigateMonth(1); });
    if (bookBtn) bookBtn.addEventListener('click', handleMarkBooked);
    if (unbookBtn) unbookBtn.addEventListener('click', handleMarkAvailable);
    if (clearBtn) clearBtn.addEventListener('click', clearSelection);
    if (signoutBtn) signoutBtn.addEventListener('click', handleSignOut);
    if (rangeModeCheck) {
      rangeModeCheck.addEventListener('change', function() {
        rangeMode = this.checked;
        rangeStart = null;
        if (!rangeMode) clearSelection();
      });
    }

    renderAdminCalendar();
  }

  function navigateMonth(dir) {
    currentMonth += dir;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    clearSelection();
    renderAdminCalendar();
  }

  function atMin() { return currentYear === MIN_YEAR && currentMonth === MIN_MONTH; }
  function atMax() { return currentYear === MAX_YEAR && currentMonth === MAX_MONTH; }

  async function renderAdminCalendar() {
    var grid  = document.getElementById('adminCalGrid');
    var label = document.getElementById('adminCalLabel');
    var prev  = document.getElementById('adminCalPrev');
    var next  = document.getElementById('adminCalNext');

    if (!grid || !label) return;

    label.textContent = MONTH_NAMES[currentMonth] + ' ' + currentYear;
    if (prev) prev.disabled = atMin();
    if (next) next.disabled = atMax();

    grid.innerHTML = '<div class="calendar-loading">Loading calendar&hellip;</div>';

    var api = getAPI();
    try {
      var mk = monthKey(currentYear, currentMonth);
      var startDate = mk + '-01';
      var lastDay = daysInMonth(currentYear, currentMonth);
      var endDate = mk + '-' + pad(lastDay);

      if (api) {
        bookedDatesSet = await api.getBookedDatesSet(startDate, endDate);
        bookingsRaw = await api.fetchBookings(startDate, endDate);
      } else {
        bookedDatesSet = new Set();
        bookingsRaw = [];
      }
    } catch (e) {
      bookedDatesSet = new Set();
      bookingsRaw = [];
    }

    // Build cells
    var totalDays = daysInMonth(currentYear, currentMonth);
    var startDow = mondayIndex(currentYear, currentMonth, 1);
    var totalCells = startDow + totalDays;
    var rows = Math.ceil(totalCells / 7);
    var cellCount = rows * 7;
    var todayStr = dateKey(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

    var html = '';
    for (var i = 0; i < cellCount; i++) {
      var dayNum = i - startDow + 1;
      var inMonth = dayNum >= 1 && dayNum <= totalDays;
      var isLastRow = i >= (rows - 1) * 7;

      var classes = 'calendar-cell';
      if (isLastRow) classes += ' last-row';

      if (!inMonth) {
        classes += ' empty';
        html += '<div class="' + classes + '"></div>';
        continue;
      }

      var key = dateKey(currentYear, currentMonth, dayNum);
      var isBooked = bookedDatesSet.has(key);
      var isToday = key === todayStr;
      var isSelected = selectedDates.has(key);

      if (isBooked) classes += ' booked';
      if (isToday) classes += ' today';
      if (isSelected) classes += ' selected';

      var crossHtml = isBooked ? '<span class="date-cross" aria-hidden="true">&#10005;</span>' : '';

      html += '<div class="' + classes + '" data-date="' + key + '">' +
                '<div class="date-inner">' +
                  '<span class="date-number">' + dayNum + '</span>' +
                  crossHtml +
                '</div>' +
              '</div>';
    }

    grid.innerHTML = html;

    // Attach click handlers
    grid.querySelectorAll('.calendar-cell[data-date]').forEach(function(cell) {
      cell.addEventListener('click', function(e) {
        handleCellClick(this.getAttribute('data-date'), e);
      });
    });

    updateActionButtons();
  }

  function handleCellClick(key, event) {
    if (rangeMode) {
      if (!rangeStart) {
        rangeStart = key;
        selectedDates.clear();
        selectedDates.add(key);
      } else {
        selectedDates.clear();
        selectRange(rangeStart, key);
        rangeStart = null;
      }
      refreshSelectionVisuals();
      updateActionButtons();
      return;
    }

    if (event.shiftKey && lastClickedDate) {
      selectRange(lastClickedDate, key);
    } else {
      if (selectedDates.has(key)) {
        selectedDates.delete(key);
      } else {
        selectedDates.add(key);
      }
    }

    lastClickedDate = key;
    refreshSelectionVisuals();
    updateActionButtons();
  }

  function selectRange(from, to) {
    var d1 = parseDateUTC(from);
    var d2 = parseDateUTC(to);
    if (d1 > d2) { var tmp = d1; d1 = d2; d2 = tmp; }

    var cursor = new Date(d1.getTime());
    while (cursor <= d2) {
      var k = dateKey(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate());
      if (cursor.getUTCFullYear() === currentYear && cursor.getUTCMonth() === currentMonth) {
        selectedDates.add(k);
      }
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1));
    }
  }

  function refreshSelectionVisuals() {
    var grid = document.getElementById('adminCalGrid');
    if (!grid) return;

    grid.querySelectorAll('.calendar-cell[data-date]').forEach(function(cell) {
      var key = cell.getAttribute('data-date');
      if (selectedDates.has(key)) {
        cell.classList.add('selected');
      } else {
        cell.classList.remove('selected');
      }
    });
  }

  function clearSelection() {
    selectedDates.clear();
    lastClickedDate = null;
    rangeStart = null;
    refreshSelectionVisuals();
    updateActionButtons();
  }

  function updateActionButtons() {
    var bookBtn = document.getElementById('btnMarkBooked');
    var unbookBtn = document.getElementById('btnMarkAvailable');
    var info = document.getElementById('selectionInfo');

    var hasSelection = selectedDates.size > 0;
    var hasAvailableSelected = false;
    var hasBookedSelected = false;

    selectedDates.forEach(function(key) {
      if (bookedDatesSet.has(key)) {
        hasBookedSelected = true;
      } else {
        hasAvailableSelected = true;
      }
    });

    if (bookBtn) bookBtn.disabled = !hasAvailableSelected;
    if (unbookBtn) unbookBtn.disabled = !hasBookedSelected;
    if (info) {
      info.textContent = hasSelection ? selectedDates.size + ' date' + (selectedDates.size > 1 ? 's' : '') + ' selected' : '';
    }
  }

  // -----------------------------------------------------------------------
  // Mark as Booked
  // -----------------------------------------------------------------------
  function handleMarkBooked() {
    var datesToBook = [];
    selectedDates.forEach(function(key) {
      if (!bookedDatesSet.has(key)) datesToBook.push(key);
    });
    if (datesToBook.length === 0) return;

    datesToBook.sort();

    var ranges = groupContiguousDates(datesToBook);
    var rangeText = ranges.map(function(r) {
      if (r.start === r.end) return formatDateDisplay(r.start);
      return formatDateDisplay(r.start) + ' – ' + formatDateDisplay(r.end);
    }).join(', ');

    showConfirmDialog(
      'Confirm Booking',
      'Mark the following dates as booked?\n' + rangeText,
      false,
      async function() {
        var api = getAPI();
        try {
          for (var i = 0; i < ranges.length; i++) {
            await api.createBooking(ranges[i].start, ranges[i].end);
          }
          showToast('Dates marked as booked successfully.', 'success');
          clearSelection();
          await renderAdminCalendar();
        } catch (e) {
          showToast('Failed to save booking. ' + (e.message || ''), 'error');
        }
      }
    );
  }

  // -----------------------------------------------------------------------
  // Mark as Available
  // -----------------------------------------------------------------------
  function handleMarkAvailable() {
    var datesToFree = [];
    selectedDates.forEach(function(key) {
      if (bookedDatesSet.has(key)) datesToFree.push(key);
    });
    if (datesToFree.length === 0) return;

    datesToFree.sort();

    var bookingIds = new Set();
    datesToFree.forEach(function(key) {
      var d = parseDateUTC(key);
      bookingsRaw.forEach(function(b) {
        var bs = parseDateUTC(b.start_date);
        var be = parseDateUTC(b.end_date);
        if (d >= bs && d <= be) {
          bookingIds.add(b.id);
        }
      });
    });

    var rangeText = datesToFree.length + ' date' + (datesToFree.length > 1 ? 's' : '') +
                    ' (' + bookingIds.size + ' booking' + (bookingIds.size > 1 ? 's' : '') + ')';

    showConfirmDialog(
      'Remove Booking',
      'Make ' + rangeText + ' available again? This will remove the booking document(s) in Firestore for these dates.',
      true,
      async function() {
        var api = getAPI();
        try {
          var ids = Array.from(bookingIds);
          for (var i = 0; i < ids.length; i++) {
            await api.deleteBooking(ids[i]);
          }
          showToast('Dates are now available.', 'success');
          clearSelection();
          await renderAdminCalendar();
        } catch (e) {
          showToast('Failed to remove booking. ' + (e.message || ''), 'error');
        }
      }
    );
  }

  // -----------------------------------------------------------------------
  // Sign out
  // -----------------------------------------------------------------------
  function handleSignOut() {
    var api = getAPI();
    if (api) {
      api.signOut().then(function() {
        window.location.href = 'index.html';
      }).catch(function() {
        window.location.href = 'index.html';
      });
    } else {
      window.location.href = 'index.html';
    }
  }

  // -----------------------------------------------------------------------
  // Confirm dialog
  // -----------------------------------------------------------------------
  function showConfirmDialog(title, message, isDanger, onConfirm) {
    var overlay = document.getElementById('confirmOverlay');
    var heading = document.getElementById('confirmTitle');
    var body    = document.getElementById('confirmMessage');
    var okBtn   = document.getElementById('confirmOk');
    var cancelBtn = document.getElementById('confirmCancel');

    if (!overlay) return;

    heading.textContent = title;
    body.textContent = message;
    okBtn.className = 'btn-confirm-ok' + (isDanger ? ' danger' : '');
    okBtn.textContent = isDanger ? 'Remove' : 'Confirm';
    overlay.classList.add('visible');

    function close() {
      overlay.classList.remove('visible');
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
    }

    function handleOk() { close(); onConfirm(); }
    function handleCancel() { close(); }

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
  }

  // -----------------------------------------------------------------------
  // Toast
  // -----------------------------------------------------------------------
  function showToast(message, type) {
    var toast = document.getElementById('adminToast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = 'admin-toast ' + type + ' visible';

    setTimeout(function() {
      toast.classList.remove('visible');
    }, 3200);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  function groupContiguousDates(sortedDates) {
    var ranges = [];
    var i = 0;
    while (i < sortedDates.length) {
      var start = sortedDates[i];
      var end = start;
      while (i + 1 < sortedDates.length) {
        var curr = parseDateUTC(sortedDates[i]);
        var next = parseDateUTC(sortedDates[i + 1]);
        var diff = (next.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          end = sortedDates[i + 1];
          i++;
        } else {
          break;
        }
      }
      ranges.push({ start: start, end: end });
      i++;
    }
    return ranges;
  }

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initLogin();
      initDashboard();
    });
  } else {
    initLogin();
    initDashboard();
  }
})();
