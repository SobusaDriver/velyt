/* Web onboarding: the app's profiling questions, answered without an account.
   Results are a limited shortlist; the report, peritaje and alerts live in the app. */
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
  var state = { step: -1, answers: loadAnswers(), vehicles: null, matches: null, error: null }

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

  function priceLabel(min, max) {
    if (!min && !max) return "Precio por confirmar"
    var lo = Math.round(Math.min(min || max, max || min) / 1e6)
    var hi = Math.round(Math.max(min || max, max || min) / 1e6)
    return lo === hi ? "$" + lo + "M" : "$" + lo + "M – $" + hi + "M"
  }

  var REASONS = {
    topSeller: "Más vendido",
    withinBudget: "Dentro de tu presupuesto",
    overBudget: "Cerca de tu presupuesto",
    terrainMatch: "Apto para tu terreno",
    establishedBrand: "Marca establecida",
    newcomerPick: "Marca nueva",
    luxuryPick: "Gama alta",
    recentModel: "Modelo reciente",
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

  function progress() {
    var total = CFG.steps.length
    return state.step < 0 ? 0 : Math.round(((state.step + 1) / total) * 100)
  }

  function render() {
    var root = el("flow")
    el("progress-fill").style.width = progress() + "%"
    if (state.step < 0) {
      root.innerHTML = introHtml()
      return
    }
    if (state.step >= CFG.steps.length) {
      root.innerHTML =
        state.matches === null
          ? loadingHtml()
          : state.error
            ? errorHtml()
            : resultsHtml()
      if (state.matches === null && !state.error) fetchCatalog()
      return
    }
    root.innerHTML = stepHtml(CFG.steps[state.step])
  }

  function introHtml() {
    return (
      "<section>" +
      '<span class="section-label">velyt · Colombia</span>' +
      '<h1 class="section-title">Encuentra tu carro en 8 preguntas</h1>' +
      '<p class="section-desc">Sin cuenta, sin teléfono y sin correo. Responde y te mostramos los carros que encajan con tu vida.</p>' +
      '<p class="section-desc">En la web ves una lista corta. El precio justo, el peritaje y las alertas están en la app.</p>' +
      '<div class="actions"><button class="btn" id="start" data-cta="onboarding-start">Empezar</button></div>' +
      "</section>"
    )
  }

  function stepHtml(step) {
    var html =
      "<section>" +
      '<span class="section-label">Pregunta ' +
      (state.step + 1) +
      " de " +
      CFG.steps.length +
      "</span>" +
      '<h2 class="section-title">' +
      step.title +
      "</h2>" +
      '<p class="section-desc">' +
      step.subtitle +
      "</p>"

    if (step.type === "range") {
      var budget = state.answers.budget || { min: step.defaultMin, max: step.defaultMax }
      html +=
        '<div class="budget">' +
        '<label>Mínimo <strong id="budget-min-label">$' +
        budget.min +
        "M</strong></label>" +
        '<input id="budget-min" type="range" min="' +
        step.min +
        '" max="' +
        step.max +
        '" step="' +
        step.step +
        '" value="' +
        budget.min +
        '">' +
        '<label>Máximo <strong id="budget-max-label">$' +
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
    } else if (step.type === "multi") {
      html += '<div class="choices" role="group">'
      step.options.forEach(function (opt) {
        var selected = (state.answers[step.field] || []).indexOf(opt.value) >= 0
        html += optionHtml(step, opt, selected)
      })
      html += "</div>"
    } else {
      html += '<div class="choices" role="group">'
      step.options.forEach(function (opt) {
        var selected = state.answers[step.field] === opt.value
        html += optionHtml(step, opt, selected)
      })
      html += "</div>"
      if (step.field === "paymentMethod" && state.answers.paymentMethod === "CREDIT") {
        html += paymentDetailHtml()
      }
    }

    html += '<div class="actions">'
    if (state.step > 0) html += '<button class="chip" id="back">Atrás</button>'
    if (step.type === "multi") html += '<button class="chip" id="skip">Sin preferencia</button>'
    html +=
      '<button class="btn" id="next"' +
      (canContinue() ? "" : " disabled") +
      ">" +
      (state.step === CFG.steps.length - 1 ? "Ver resultados" : "Continuar") +
      "</button>" +
      "</div>" +
      "</section>"
    return html
  }

  function optionHtml(step, opt, selected) {
    return (
      '<button class="choice" data-field="' +
      step.field +
      '" data-value="' +
      opt.value +
      '" aria-pressed="' +
      selected +
      '">' +
      '<span class="icon-mark">' +
      (opt.icon || "•") +
      "</span>" +
      "<h3>" +
      opt.label +
      "</h3>" +
      (opt.desc ? "<p>" + opt.desc + "</p>" : "") +
      "</button>"
    )
  }

  function paymentDetailHtml() {
    var plan = state.answers.plan || { down: 20, months: 60 }
    var downs = [10, 20, 30, 40]
    var terms = [36, 48, 60, 72]
    var html = '<p class="section-desc">Cuota inicial y plazo</p><div class="chip-row">'
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
        " meses</button>"
    })
    return html + "</div>"
  }

  function canContinue() {
    var step = CFG.steps[state.step]
    if (!step) return false
    var value = state.answers[step.field]
    if (step.type === "multi") return true
    if (step.field === "budget") return true
    return value !== undefined && value !== null && value !== ""
  }

  function loadingHtml() {
    return (
      "<section>" +
      '<span class="section-label">Buscando</span>' +
      '<h2 class="section-title">Buscando carros que encajen contigo…</h2>' +
      "</section>"
    )
  }

  function errorHtml() {
    return (
      "<section>" +
      '<span class="section-label">Error</span>' +
      '<h2 class="section-title">No pudimos cargar el catálogo</h2>' +
      '<p class="section-desc">Revisa tu conexión e inténtalo otra vez.</p>' +
      '<div class="actions"><button class="chip" id="retry">Reintentar</button>' +
      '<a class="btn" href="' +
      APP_STORE +
      '" data-cta="onboarding-appstore-error">Abrir en la app</a></div></section>'
    )
  }

  function resultsHtml() {
    var matches = state.matches || []
    var html =
      "<section>" +
      '<span class="section-label">Tus matches</span>' +
      '<h2 class="section-title">' +
      (matches.length
        ? matches.length + " carros para ti"
        : "No encontramos carros con esos filtros") +
      "</h2>" +
      '<p class="section-desc">Precio justo estimado con Revista Motor y catálogo. El peritaje y el historial completo viven en la app.</p>' +
      '<div class="actions"><button class="chip" id="restart">Repetir preguntas</button></div>'

    if (!matches.length) {
      html +=
        '<div class="actions"><button class="chip" id="edit-budget">Ajustar presupuesto</button>' +
        '<button class="chip" id="restart">Empezar de nuevo</button>' +
        '<a class="btn" href="' + APP_STORE + '" data-cta="onboarding-appstore-empty">Abrir en la app</a></div></section>'
      return html
    }

    html += '<div class="results">'
    matches.forEach(function (vehicle) {
      var meta = [
        vehicle.year_range,
        vehicle.body_type,
        vehicle.fuel_type,
        vehicle.seats ? vehicle.seats + " puestos" : null,
      ]
        .filter(Boolean)
        .join(" · ")
      var reasons = (vehicle.matchReasons || [])
        .slice(0, 3)
        .map(function (reason) {
          return REASONS[reason] || reason
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
          ? '<div class="match-meta">Precio justo ~$' +
            millions(vehicle.fairPrice.low) +
            "M – $" +
            millions(vehicle.fairPrice.high) +
            "M</div>"
          : "") +
        '<div class="match-meta"><a href="' +
        DEEP_BASE +
        vehicle.id +
        '" data-cta="onboarding-open-vehicle">Ver en la app →</a></div>' +
        "</div>" +
        '<div class="match-score"><b>' +
        (vehicle.matchScore != null ? vehicle.matchScore : "—") +
        "</b><span>match</span></div>" +
        "</article>"
    })
    html += "</div>"

    html +=
      '<div class="actions">' +
      '<a class="btn" href="' + APP_STORE + '" data-cta="onboarding-appstore">Continuar en la app</a>' +
      "</div></section>"
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

  /** The model year the estimate is quoted for: this year if the range covers it. */
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

  /**
   * Fair price for each match, using the same estimator the app ships:
   * Revista Motor (public `vehicle_prices`) plus the catalog range.
   */
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

  function millions(value) {
    return Math.round(value / 1e6)
  }

  async function fetchCatalog() {
    if (state.answers.budget === undefined) {
      state.answers.budget = { min: 40, max: 100 }
      saveAnswers()
    }
    try {
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
        budget_min: state.answers.budget.min,
        budget_max: state.answers.budget.max,
        has_filters: (state.answers.vehicleTypes || []).length > 0,
      })
    } catch (e) {
      state.error = true
    }
    render()
  }

  function bind() {
    document.addEventListener("click", function (event) {
      var target = event.target
      if (!(target instanceof Element)) return
      var option = target.closest(".choice[data-field]")
      if (option) {
        var step = CFG.steps[state.step]
        var value = option.getAttribute("data-value")
        if (step.type === "multi") {
          var list = state.answers[step.field] || []
          var next = list.indexOf(value) >= 0 ? list.filter(function (v) {
            return v !== value
          }) : list.concat([value])
          state.answers[step.field] = next
        } else {
          state.answers[step.field] = value
        }
        saveAnswers()
        track("web_onboarding_step", { step: step.field, value: value })
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
      if (target.id === "start") {
        state.step = hasAllAnswers() ? CFG.steps.length : 0
        render()
      } else if (target.id === "next") {
        if (!canContinue()) return
        state.step += 1
        render()
      } else if (target.id === "back") {
        state.step = Math.max(0, state.step - 1)
        render()
      } else if (target.id === "skip") {
        var current = CFG.steps[state.step]
        state.answers[current.field] = []
        saveAnswers()
        state.step += 1
        render()
      } else if (target.id === "restart") {
        state.answers = {}
        state.matches = null
        state.error = null
        state.step = -1
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch (e) {}
        render()
      } else if (target.id === "retry") {
        state.error = null
        state.matches = null
        render()
      } else if (target.id === "edit-budget") {
        var budgetStep = CFG.steps.findIndex(function (s) {
          return s.field === "budget"
        })
        state.step = budgetStep
        render()
      }
    })

    document.addEventListener("input", function (event) {
      var target = event.target
      if (!(target instanceof HTMLInputElement)) return
      if (target.id !== "budget-min" && target.id !== "budget-max") return
      var budget = state.answers.budget || { min: 40, max: 100 }
      budget.min = Number(el("budget-min").value)
      budget.max = Number(el("budget-max").value)
      if (budget.min > budget.max) {
        if (target.id === "budget-min") budget.max = budget.min
        else budget.min = budget.max
        el("budget-min").value = budget.min
        el("budget-max").value = budget.max
      }
      state.answers.budget = budget
      saveAnswers()
      el("budget-min-label").textContent = "$" + budget.min + "M"
      el("budget-max-label").textContent = "$" + budget.max + "M"
    })
  }

  /** Where a reload should land: intro, the first unanswered step, or results. */
  function resumeStep() {
    var answers = state.answers || {}
    if (Object.keys(answers).length === 0) return -1
    if (hasAllAnswers()) return CFG.steps.length
    for (var i = 0; i < CFG.steps.length; i++) {
      var step = CFG.steps[i]
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
    return CFG.steps.length
  }

  function hasAllAnswers() {
    return CFG.steps.every(function (step) {
      if (step.type === "range") return !!state.answers.budget
      if (step.type === "multi") return Array.isArray(state.answers[step.field])
      return state.answers[step.field] != null
    })
  }

  if (!CFG) return
  state.step = resumeStep()
  bind()
  render()
})()
