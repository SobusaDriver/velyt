/* Theme persistence shared by every page. Both pages load this before rendering. */
(function () {
  var meta = document.querySelector('meta[name="theme-color"]')
  var moon = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
  var sun =
    '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'

  function paint(isLight) {
    document.documentElement.classList.toggle('light', isLight)
    var icon = document.getElementById('theme-icon')
    if (icon) icon.innerHTML = isLight ? sun : moon
    if (meta) meta.content = isLight ? '#f5f5f5' : '#0d0d0d'
  }

  window.toggleTheme = function () {
    var isLight = !document.documentElement.classList.contains('light')
    paint(isLight)
    localStorage.setItem('theme', isLight ? 'light' : 'dark')
  }

  if (localStorage.getItem('theme') === 'light') requestAnimationFrame(function () { paint(true) })
})()
