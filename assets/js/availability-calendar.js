/* ===================================================
   Availability Calendar — Laurel Lodge
   Vanilla JS · UK week (Mon–Sun) · UTC dates · Cross Indicator
   =================================================== */

(function () {
  'use strict';

  // ---- Config ----------------------------------------------------------
  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  const now       = new Date();
  const MIN_YEAR  = now.getUTCFullYear();
  const MIN_MONTH = now.getUTCMonth();          // 0-based
  const MAX_YEAR  = MIN_YEAR + 5;
  const MAX_MONTH = MIN_MONTH;                  // same month, +5 years

  // ---- State -----------------------------------------------------------
  let currentYear  = MIN_YEAR;
  let currentMonth = MIN_MONTH;
  const bookedCache = {};                       // 'YYYY-MM' -> Set<'YYYY-MM-DD'>

  // ---- Helpers ---------------------------------------------------------
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function dateKey(y, m, d) {
    return y + '-' + pad(m + 1) + '-' + pad(d);
  }

  function monthKey(y, m) { return y + '-' + pad(m + 1); }

  function todayKey() {
    return dateKey(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  }

  /**
   * Day-of-week adjusted to Monday = 0 ... Sunday = 6
   */
  function mondayIndex(y, m, d) {
    const day = new Date(Date.UTC(y, m, d)).getUTCDay(); // 0=Sun
    return (day + 6) % 7; // shift so Mon=0
  }

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  }

  // ---- Navigation limits -----------------------------------------------
  function atMin() {
    return currentYear === MIN_YEAR && currentMonth === MIN_MONTH;
  }
  function atMax() {
    return currentYear === MAX_YEAR && currentMonth === MAX_MONTH;
  }

  // ---- Booking fetch ---------------------------------------------------
  async function fetchBookedDates(y, m) {
    const key = monthKey(y, m);
    if (bookedCache[key]) return bookedCache[key];

    if (typeof window.AvailabilityAPI === 'object' &&
        typeof window.AvailabilityAPI.getBookedDatesSet === 'function') {
      try {
        const startDate = key + '-01';
        const lastDay = daysInMonth(y, m);
        const endDate = key + '-' + pad(lastDay);
        const set = await window.AvailabilityAPI.getBookedDatesSet(startDate, endDate);
        bookedCache[key] = set instanceof Set ? set : new Set();
      } catch (_) {
        bookedCache[key] = new Set();
      }
    } else {
      // API not available — default all to available
      bookedCache[key] = new Set();
    }
    return bookedCache[key];
  }

  // ---- Render ----------------------------------------------------------
  async function render() {
    const grid    = document.getElementById('calendarGrid');
    const label   = document.getElementById('calendarMonthLabel');
    const prevBtn = document.getElementById('calendarPrev');
    const nextBtn = document.getElementById('calendarNext');

    if (!grid || !label) return;

    // Update header
    label.textContent = MONTH_NAMES[currentMonth] + ' ' + currentYear;
    prevBtn.disabled = atMin();
    nextBtn.disabled = atMax();

    // Show loading
    grid.innerHTML = '<div class="calendar-loading">Loading calendar&hellip;</div>';

    // Fetch booked dates
    const booked = await fetchBookedDates(currentYear, currentMonth);

    // Build cells
    const totalDays = daysInMonth(currentYear, currentMonth);
    const startDow  = mondayIndex(currentYear, currentMonth, 1); // 0=Mon
    const totalCells = startDow + totalDays;
    const rows       = Math.ceil(totalCells / 7);
    const cellCount  = rows * 7;
    const today      = todayKey();

    let html = '';

    for (let i = 0; i < cellCount; i++) {
      const dayNum   = i - startDow + 1;
      const inMonth  = dayNum >= 1 && dayNum <= totalDays;
      const isLastRow = i >= (rows - 1) * 7;

      let classes = 'calendar-cell';
      if (isLastRow) classes += ' last-row';

      if (!inMonth) {
        classes += ' empty';
        html += '<div class="' + classes + '"></div>';
        continue;
      }

      const key = dateKey(currentYear, currentMonth, dayNum);
      const isBooked = booked.has(key);
      const isToday  = key === today;

      if (isBooked) classes += ' booked';
      if (isToday)  classes += ' today';

      const crossHtml = isBooked ? '<span class="date-cross" aria-hidden="true">&#10005;</span>' : '';

      html += '<div class="' + classes + '" data-date="' + key + '">' +
                '<div class="date-inner">' +
                  '<span class="date-number">' + dayNum + '</span>' +
                  crossHtml +
                '</div>' +
              '</div>';
    }

    grid.innerHTML = html;
  }

  // ---- Navigation handlers ---------------------------------------------
  function prevMonth() {
    if (atMin()) return;
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    render();
  }

  function nextMonth() {
    if (atMax()) return;
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    render();
  }

  // ---- Init on DOM ready -----------------------------------------------
  function init() {
    const prevBtn = document.getElementById('calendarPrev');
    const nextBtn = document.getElementById('calendarNext');

    if (prevBtn) prevBtn.addEventListener('click', prevMonth);
    if (nextBtn) nextBtn.addEventListener('click', nextMonth);

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
