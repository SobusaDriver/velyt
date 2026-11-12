/* Web onboarding: the app's carousel (progress, block pill, emoji, options).
   Answers live in localStorage; matches come from the app's match_vehicles RPC. */
(function () {
  var CFG = window.VELYT_ONBOARDING
  var STORAGE_KEY = "velyt:onboarding"
  var APP_STORE = "https://apps.apple.com/co/app/velyt/id6778179192?ct=web-onboarding"
  var DEEP_BASE = "https://sobusadriver.github.io/velyt/search/vehicle/"
  var cop = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  })

  var el = function (id) {
    return document.getElementById(id)
  }

  var LANG = localStorage.getItem("lang") === "en" ? "en" : "es"
  var STEPS = function () {
    return CFG.steps[LANG]
  }
  var STR = {
    es: {
      back: "← Atrás",
      next: "Siguiente →",
      finish: "Ver resultados",
      repeat: "Repetir preguntas",
      search: "Buscando carros que encajen contigo…",
      errorTitle: "No pudimos cargar el catálogo",
      errorDesc: "Revisa tu conexión e inténtalo otra vez.",
      retry: "Reintentar",
      results: "Tus matches",
      resultsCount: function (n) {
        return n ? n + " carros para ti" : "No encontramos carros con esos filtros"
      },
      limited:
        "Precio justo estimado con Revista Motor y catálogo. El peritaje y el historial completo viven en la app.",
      adjust: "Ajustar presupuesto",
      openApp: "Continuar en la app",
      viewInApp: "Ver en la app →",
      plan: "Cuota inicial y plazo",
      months: "meses",
      fair: "Precio justo ~",
      match: "match",
    },
    en: {
      back: "← Back",
      next: "Next →",
      finish: "See results",
      repeat: "Start over",
      search: "Finding cars that fit you…",
      errorTitle: "We couldn't load the catalog",
      errorDesc: "Check your connection and try again.",
      retry: "Retry",
      results: "Your matches",
      resultsCount: function (n) {
        return n ? n + " cars for you" : "No cars match those filters"
      },
      limited:
        "Fair price estimated from Revista Motor and the catalog. The inspection and full history live in the app.",
      adjust: "Adjust budget",
      openApp: "Continue in the app",
      viewInApp: "Open in the app →",
      plan: "Down payment and term",
      months: "months",
      fair: "Fair price ~",
      match: "match",
    },
  }

  var REASONS = {
    topSeller: { es: "Más vendido", en: "Top seller" },
    withinBudget: { es: "Dentro de tu presupuesto", en: "Within budget" },
    overBudget: { es: "Cerca de tu presupuesto", en: "Near your budget" },
    terrainMatch: { es: "Apto para tu terreno", en: "Fits your terrain" },
    establishedBrand: { es: "Marca establecida", en: "Established brand" },
    newcomerPick: { es: "Marca nueva", en: "Newcomer brand" },
    luxuryPick: { es: "Gama alta", en: "Premium" },
    recentModel: { es: "Modelo reciente", en: "Recent model" },
  }

  var state = {
    step: 0,
    answers: loadAnswers(),
    matches: null,
    error: null,
  }

  function t() {
    return STR[LANG]
  }

  function track(event, props) {
    if (window.posthog) window.posthog.capture(event, props || {})
  }

  function loadAnswers() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch (e) {
      return {}
    }
  }

  function saveAnswers() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.answers))
    } catch (e) {
      /* private mode: the flow still works for this visit */
    }
  }

  function compact(value) {
    if (!value) return "$0"
    if (value >= 1e6) {
      var millions = value / 1e6
      var text = Number.isInteger(millions) ? String(millions) : millions.toFixed(1).replace(".", ",")
      return "$" + text + "M"
    }
    return "$" + Math.round(value / 1e3) + "k"
  }

  function millions(value) {
    return Math.round(value / 1e6)
  }

  /** Same profile shape the app sends to `match_vehicles`. */
  function profileForMatch() {
    var a = state.answers
    var budget = a.budget || {}
    var plan = a.plan || {}
    return {
      capacity: {
        passenger_range: a.passengerRange || null,
        needs_cargo: a.needsCargo === "YES" ? true : a.needsCargo === "NO" ? false : null,
        vehicle_type: a.vehicleTypes || [],
      },
      environment: { terrain_type: a.terrainType || null },
      preferences: {
        accepted_fuels: a.fuels || [],
        has_home_charger: null,
        max_vehicle_age_years: null,
        brand_preference: [],
        use_context: a.useContext || null,
      },
      financials: {
        min_budget_cop: (budget.min || 0) * 1e6,
        max_budget_cop: (budget.max || 0) * 1e6,
        payment_method: a.paymentMethod || null,
        down_payment_pct: plan.down || null,
        term_months: plan.months || null,
        down_payment_cop: null,
        max_monthly_cop: null,
      },
    }
  }

  function hasAllAnswers() {
    return STEPS().every(function (step) {
      if (step.type === "range") return !!state.answers.budget
      if (step.type === "multi") return Array.isArray(state.answers[step.field])
      return state.answers[step.field] != null
    })
  }

  function resumeStep() {
    var answers = state.answers || {}
    if (Object.keys(answers).length === 0) return 0
    if (hasAllAnswers()) return STEPS().length
    for (var i = 0; i < STEPS().length; i++) {
      var step = STEPS()[i]
      if (step.type === "range") {
        if (!answers.budget) return i
        continue
      }
      if (step.type === "multi") {
        if (!Array.isArray(answers[step.field])) return i
        continue
      }
      if (answers[step.field] == null) return i
    }
    return STEPS().length
  }

  function canContinue() {
    var step = STEPS()[state.step]
    if (!step) return false
    if (step.type === "multi") return true
    if (step.type === "range") return true
    return state.answers[step.field] != null
  }

  function render() {
    var root = el("flow")
    if (!root) return
    if (state.step >= STEPS().length) {
      root.innerHTML =
        state.matches === null ? loadingView() : state.error ? errorView() : resultsView()
      if (state.matches === null && !state.error) void fetchMatches()
      return
    }
    root.innerHTML = stepView(STEPS()[state.step])
  }

  function headView() {
    var total = STEPS().length
    var progress = state.step >= total ? 100 : Math.round(((state.step + 1) / total) * 100)
    return (
      '<div class="ob-head">' +
      '<div class="ob-track"><span class="ob-fill" style="width:' +
      progress +
      '%"></span></div>' +
      '<div class="ob-count">' +
      Math.min(state.step + 1, total) +
      " / " +
      total +
      "</div></div>"
    )
  }

  function stepView(step) {
    var html =
      headView() +
      '<div class="ob-scroll">' +
      '<div class="ob-emoji" aria-hidden="true">' +
      (step.emoji || "•") +
      "</div>" +
      '<div class="ob-block">' +
      CFG.blocks[LANG].prefix +
      " " +
      step.block.toUpperCase() +
      " · " +
      CFG.blocks[LANG][step.block] +
      "</div>" +
      '<h1 class="ob-title">' +
      step.title +
      "</h1>" +
      '<p class="ob-sub">' +
      step.subtitle +
      "</p>"

    if (step.type === "range") {
      var budget = state.answers.budget || { min: 0, max: step.defaultMax }
      var upTo = LANG === "es" ? "Hasta" : "Up to"
      html +=
        '<div class="ob-budget">' +
        "<label>" +
        upTo +
        ' <strong id="budget-max-label">$' +
        budget.max +
        "M</strong></label>" +
        '<input id="budget-max" type="range" min="' +
        step.min +
        '" max="' +
        step.max +
        '" step="' +
        step.step +
        '" value="' +
        budget.max +
        '">' +
        "</div>"
    } else {
      html += '<div class="choices" role="group">'
      step.options.forEach(function (opt) {
        var selected =
          step.type === "multi"
            ? (state.answers[step.field] || []).indexOf(opt.value) >= 0
            : state.answers[step.field] === opt.value
        html += choiceHtml(step, opt, selected)
      })
      html += "</div>"
      if (step.field === "paymentMethod" && state.answers.paymentMethod === "CREDIT") {
        html += planHtml()
      }
    }

    html += "</div>" + navView(step)
    return html
  }

  function choiceHtml(step, opt, selected) {
    return (
      '<button class="choice" data-field="' +
      step.field +
      '" data-value="' +
      opt.value +
      '" aria-pressed="' +
      selected +
      '">' +
      '<span class="icon-mark" aria-hidden="true">' +
      (opt.icon || "•") +
      "</span>" +
      '<span class="choice-text"><strong>' +
      opt.label +
      "</strong>" +
      (opt.desc ? "<small>" + opt.desc + "</small>" : "") +
      "</span>" +
      '<span class="choice-radio" aria-hidden="true"></span>' +
      "</button>"
    )
  }

  function planHtml() {
    var plan = state.answers.plan || { down: 20, months: 60 }
    var downs = [10, 20, 30, 40]
    var terms = [36, 48, 60, 72]
    var html = '<p class="ob-plan-label">' + t().plan + '</p><div class="chip-row">'
    downs.forEach(function (pct) {
      html +=
        '<button class="chip' +
        (plan.down === pct ? " on" : "") +
        '" data-plan="down" data-value="' +
        pct +
        '" aria-pressed="' +
        (plan.down === pct) +
        '">' +
        pct +
        "%</button>"
    })
    html += '</div><div class="chip-row">'
    terms.forEach(function (m) {
      html +=
        '<button class="chip' +
        (plan.months === m ? " on" : "") +
        '" data-plan="months" data-value="' +
        m +
        '" aria-pressed="' +
        (plan.months === m) +
        '">' +
        m +
        " " +
        t().months +
        "</button>"
    })
    return html + "</div>"
  }

  function navView(step) {
    var isLast = state.step === STEPS().length - 1
    var ready = canContinue()
    return (
      '<div class="ob-nav">' +
      (state.step > 0
        ? '<button class="ob-back" id="back">' + t().back + "</button>"
        : "<span></span>") +
      '<button class="ob-next" id="next"' +
      (ready ? "" : " disabled") +
      ">" +
      (isLast ? t().finish : t().next) +
      "</button></div>"
    )
  }

  function loadingView() {
    return (
      headView() +
      '<div class="ob-scroll"><h1 class="ob-title">' +
      t().search +
      "</h1></div>"
    )
  }

  function errorView() {
    return (
      headView() +
      '<div class="ob-scroll"><h1 class="ob-title">' +
      t().errorTitle +
      '</h1><p class="ob-sub">' +
      t().errorDesc +
      '</p><div class="ob-actions"><button class="chip" id="retry">' +
      t().retry +
      "</button></div></div>"
    )
  }

  function resultsView() {
    var matches = state.matches || []
    var html =
      '<div class="ob-scroll"><h1 class="ob-title">' +
      t().resultsCount(matches.length) +
      '</h1><p class="ob-sub">' +
      t().limited +
      "</p>"

    if (!matches.length) {
      html +=
        '<div class="ob-actions"><button class="chip" id="edit-budget">' +
        t().adjust +
        '</button><button class="chip" id="restart">' +
        t().repeat +
        '</button><a class="btn" href="' +
        APP_STORE +
        '" data-cta="onboarding-appstore-empty">' +
        t().openApp +
        "</a></div></div>"
      return html
    }

    html += '<div class="ob-actions"><button class="chip" id="restart">' + t().repeat + "</button></div>"
    html += '<div class="results">'
    matches.forEach(function (vehicle) {
      var meta = [
        vehicle.year_range,
        vehicle.body_type,
        vehicle.fuel_type,
        vehicle.seats ? vehicle.seats + " " + (LANG === "es" ? "puestos" : "seats") : null,
      ]
        .filter(Boolean)
        .join(" · ")
      var reasons = (vehicle.matchReasons || [])
        .slice(0, 3)
        .map(function (reason) {
          return (REASONS[reason] || {})[LANG] || reason
        })
        .join(" · ")
      html +=
        '<article class="match-card"><div>' +
        '<div class="match-name">' +
        [vehicle.make, vehicle.model].filter(Boolean).join(" ") +
        "</div>" +
        '<div class="match-meta">' +
        meta +
        "</div>" +
        (reasons ? '<div class="match-meta">' + reasons + "</div>" : "") +
        (vehicle.fairPrice
          ? '<div class="match-meta">' +
            t().fair +
            "$" +
            millions(vehicle.fairPrice.low) +
            "M – $" +
            millions(vehicle.fairPrice.high) +
            "M</div>"
          : "") +
        '<div class="match-meta"><a href="' +
        DEEP_BASE +
        vehicle.id +
        '" data-cta="onboarding-open-vehicle">' +
        t().viewInApp +
        "</a></div>" +
        "</div>" +
        '<div class="match-score"><b>' +
        (vehicle.matchScore != null ? vehicle.matchScore : "—") +
        "</b><span>" +
        t().match +
        "</span></div>" +
        "</article>"
    })
    html += "</div>"
    html +=
      '<div class="ob-actions ob-actions-end"><a class="btn" href="' +
      APP_STORE +
      '" data-cta="onboarding-appstore">' +
      t().openApp +
      "</a></div>"
    html += "</div>"
    return html
  }

  function firstYear(range) {
    var start = parseInt(String(range || "").split("-")[0], 10)
    return Number.isFinite(start) ? start : null
  }

  function lastYear(range) {
    var parts = String(range || "").split("-")
    var end = parseInt(parts[parts.length - 1], 10)
    return Number.isFinite(end) ? end : null
  }

  function subjectYear(range) {
    var start = firstYear(range)
    var end = lastYear(range)
    var now = new Date().getFullYear()
    if (start && end) return Math.min(Math.max(now, start), end)
    return end || now
  }

  function normalizeModel(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  }

  /** Fair price from the app's estimator: Revista Motor plus the catalog range. */
  async function attachFairPrices(matches) {
    if (!window.VelytFairPrice || !matches.length) return
    var makes = matches
      .map(function (v) {
        return v.make
      })
      .filter(Boolean)
      .filter(function (make, index, all) {
        return all.indexOf(make) === index
      })
    if (!makes.length) return

    var rows = []
    try {
      var year = matches.reduce(function (lowest, v) {
        var y = firstYear(v.year_range)
        return y && y < lowest ? y : lowest
      }, 9999)
      var query =
        CFG.supabaseUrl +
        "/rest/v1/vehicle_prices?select=make,model,year,value_cop&make=in.(" +
        makes
          .map(function (make) {
            return '"' + make.replace(/"/g, "") + '"'
          })
          .join(",") +
        ")&year=gte." +
        year
      var res = await fetch(query, {
        headers: { apikey: CFG.supabaseKey, Authorization: "Bearer " + CFG.supabaseKey },
      })
      if (res.ok) rows = await res.json()
    } catch (e) {
      rows = []
    }

    matches.forEach(function (vehicle) {
      var year = subjectYear(vehicle.year_range)
      var model = normalizeModel(vehicle.model)
      var token = model.split(" ")[0]
      var values = rows
        .filter(function (row) {
          return (
            String(row.make).toLowerCase() === String(vehicle.make).toLowerCase() &&
            Number(row.year) === year &&
            token &&
            normalizeModel(row.model).indexOf(token) >= 0
          )
        })
        .map(function (row) {
          return Number(row.value_cop)
        })
        .filter(function (value) {
          return value > 0
        })
      var revista = values.length
        ? values.sort(function (a, b) {
            return a - b
          })[Math.floor(values.length / 2)]
        : undefined

      if (!revista && !vehicle.min_price_cop && !vehicle.max_price_cop) return
      var estimate = window.VelytFairPrice.estimateFairPrice({
        make: vehicle.make,
        year: year,
        condition: "good",
        revistaMotorPrice: revista,
        catalogMinPrice: vehicle.min_price_cop || undefined,
        catalogMaxPrice: vehicle.max_price_cop || undefined,
      })
      if (estimate.estimatedPrice > 0) {
        vehicle.fairPrice = {
          low: estimate.priceRangeLow,
          high: estimate.priceRangeHigh,
          confidence: estimate.confidence,
        }
      }
    })
  }

  async function fetchMatches() {
    try {
      if (!state.answers.budget) {
        state.answers.budget = { min: 0, max: 100 }
        saveAnswers()
      }
      var res = await fetch(CFG.supabaseUrl + "/rest/v1/rpc/match_vehicles", {
        method: "POST",
        headers: {
          apikey: CFG.supabaseKey,
          Authorization: "Bearer " + CFG.supabaseKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profile: profileForMatch() }),
      })
      if (!res.ok) throw new Error("match " + res.status)
      var data = await res.json()
      state.matches = (data || []).slice(0, 12).map(function (row) {
        return Object.assign({}, row.vehicle, {
          matchScore: row.score,
          matchReasons: row.reasons || [],
        })
      })
      await attachFairPrices(state.matches)
      track("web_matches_viewed", {
        matches: state.matches.length,
        lang: LANG,
        budget_min: state.answers.budget.min,
        budget_max: state.answers.budget.max,
      })
    } catch (e) {
      state.error = true
    }
    render()
  }

  function setLang(next) {
    LANG = next
    try {
      localStorage.setItem("lang", next)
    } catch (e) {}
    document.documentElement.lang = next === "es" ? "es-CO" : "en"
    var toggle = document.getElementById("lang-toggle")
    if (toggle) toggle.textContent = next === "es" ? "EN" : "ES"
    render()
  }

  window.toggleLang = function () {
    setLang(LANG === "es" ? "en" : "es")
  }

  function bind() {
    document.addEventListener("click", function (event) {
      var target = event.target
      if (!(target instanceof Element)) return

      var choice = target.closest(".choice[data-field]")
      if (choice) {
        var step = STEPS()[state.step]
        var value = choice.getAttribute("data-value")
        if (step.type === "multi") {
          var list = state.answers[step.field] || []
          state.answers[step.field] =
            list.indexOf(value) >= 0
              ? list.filter(function (v) {
                  return v !== value
                })
              : list.concat([value])
        } else {
          state.answers[step.field] = value
        }
        saveAnswers()
        track("web_onboarding_step", { step: step.field, value: value, lang: LANG })
        render()
        return
      }

      var chip = target.closest(".chip[data-plan]")
      if (chip) {
        var plan = state.answers.plan || { down: 20, months: 60 }
        plan[chip.getAttribute("data-plan")] = Number(chip.getAttribute("data-value"))
        state.answers.plan = plan
        saveAnswers()
        render()
        return
      }

      if (target.id === "next") {
        if (!canContinue()) return
        var current = STEPS()[state.step]
        if (current && current.type === "range" && !state.answers.budget) {
          state.answers.budget = { min: 0, max: current.defaultMax }
          saveAnswers()
        }
        state.step += 1
        render()
      } else if (target.id === "back") {
        state.step = Math.max(0, state.step - 1)
        render()
      } else if (target.id === "restart") {
        state.answers = {}
        state.matches = null
        state.error = null
        state.step = 0
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch (e) {}
        render()
      } else if (target.id === "retry") {
        state.error = null
        state.matches = null
        render()
      } else if (target.id === "edit-budget") {
        state.step = STEPS().findIndex(function (s) {
          return s.field === "budget"
        })
        state.matches = null
        state.error = null
        render()
      }
    })

    document.addEventListener("input", function (event) {
      var target = event.target
      if (!(target instanceof HTMLInputElement)) return
      if (target.id !== "budget-max") return
      var max = Number(target.value)
      state.answers.budget = { min: 0, max: max }
      saveAnswers()
      var label = el("budget-max-label")
      if (label) label.textContent = "$" + max + "M"
    })
  }

  if (!CFG) return
  state.step = resumeStep()
  document.documentElement.lang = LANG === "es" ? "es-CO" : "en"
  var toggle = document.getElementById("lang-toggle")
  if (toggle) toggle.textContent = LANG === "es" ? "EN" : "ES"
  bind()
  render()
})()
