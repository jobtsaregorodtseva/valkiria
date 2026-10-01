// Анимация примера разговора в первом экране. Без JS всё видно сразу.
(function () {
  var talk = document.querySelector("[data-talk]");
  if (!talk) return;
  var items = Array.prototype.slice.call(talk.children);
  var timer = document.querySelector("[data-timer]");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.documentElement.classList.add("js");

  if (reduce) {
    items.forEach(function (li) { li.classList.add("is-shown"); });
    if (timer) timer.textContent = "00:41";
    return;
  }

  var seconds = 0;
  var tick = null;
  function fmt(s) { return (s < 10 * 60 ? "0" : "") + Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60); }
  function startClock() {
    clearInterval(tick);
    seconds = 0;
    if (timer) timer.textContent = fmt(0);
    tick = setInterval(function () { seconds++; if (timer) timer.textContent = fmt(seconds); }, 1000);
  }

  // Пауза перед репликой зависит от её длины — похоже на живой темп разговора.
  function delayFor(li) {
    if (li.classList.contains("talk__sys")) return 700;
    var len = li.textContent.length;
    return Math.min(2600, 900 + len * 18);
  }

  var i = 0;
  function step() {
    if (i < items.length) {
      items[i].classList.add("is-shown");
      var d = delayFor(items[i]);
      i++;
      setTimeout(step, d);
    } else {
      setTimeout(function () {
        items.forEach(function (li) { li.classList.remove("is-shown"); });
        i = 0;
        setTimeout(function () { startClock(); step(); }, 700);
      }, 6000);
    }
  }

  function begin() { startClock(); setTimeout(step, 500); }

  if ("IntersectionObserver" in window) {
    var started = false;
    new IntersectionObserver(function (entries, obs) {
      if (!started && entries[0].isIntersecting) { started = true; obs.disconnect(); begin(); }
    }, { threshold: 0.25 }).observe(talk);
  } else {
    begin();
  }
})();

// Пришли по QR с форума (?from=qr) — передаём метку боту, чтобы видеть источник записи.
(function () {
  var m = /[?&]from=([a-z0-9_-]{1,32})/i.exec(location.search);
  if (!m) return;
  var links = document.querySelectorAll('a[href*="?start=site"]');
  for (var i = 0; i < links.length; i++) links[i].href = links[i].href.replace("?start=site", "?start=" + m[1].toLowerCase());
})();
