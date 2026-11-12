/* Fair-price calculator: the app's estimator, fed by Revista Motor + the catalog. */
(function () {
  var CFG = window.VELYT_ONBOARDING
  var EST = window.VelytFairPrice
  if (!CFG || !EST) return

  var el = function (id) {
    return document.getElementById(id)
  }
  var money = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  })

  var state = { vehicles: [], condition: "good" }
  var makeSelect = el("marca")
  var modelSelect = el("modelo")
  var yearSelect = el("anio")
  var kmsInput = el("kms")

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  }

  function yearsOf(range) {
    var parts = String(range || "").split("-")
    var start = parseInt(parts[0], 10)
    var end = parseInt(parts[parts.length - 1], 10)
    if (!Number.isFinite(start)) return []
    if (!Number.isFinite(end)) return [start]
    var years = []
    for (var y = start; y <= end; y++) years.push(y)
    return years
  }

  function option(value, label) {
    var o = document.createElement("option")
    o.value = value
    o.textContent = label
    return o
  }

  function fillSelect(select, items, placeholder) {
    select.innerHTML = ""
    if (!items.length) {
      select.appendChild(option("", placeholder))
      select.disabled = true
      return
    }
    select.disabled = false
    items.forEach(function (item) {
      select.appendChild(option(item.value, item.label))
    })
  }

  async function loadVehicles() {
    // PostgREST caps every response at 1,000 rows, so page through the catalog.
    var all = []
    for (var from = 0; ; from += 1000) {
      var url =
        CFG.supabaseUrl +
        "/rest/v1/vehicles?select=make,model,year_range,min_price_cop,max_price_cop&order=id&limit=1000&offset=" +
        from
      var res = await fetch(url, {
        headers: { apikey: CFG.supabaseKey, Authorization: "Bearer " + CFG.supabaseKey },
      })
      if (!res.ok) throw new Error("vehicles " + res.status)
      var page = await res.json()
      all = all.concat(page)
      if (page.length < 1000) break
    }
    return all
  }

  function refreshMakes() {
    var makes = state.vehicles
      .map(function (v) {
        return v.make
      })
      .filter(Boolean)
      .filter(function (make, index, all) {
        return all.indexOf(make) === index
      })
      .sort()
    fillSelect(
      makeSelect,
      makes.map(function (make) {
        return { value: make, label: make }
      }),
      "Sin marcas",
    )
  }

  function refreshModels() {
    var make = makeSelect.value
    if (!make) {
      fillSelect(modelSelect, [], "Elige una marca")
      fillSelect(yearSelect, [], "Elige un modelo")
      return
    }
    var models = state.vehicles
      .filter(function (v) {
        return v.make === make
      })
      .map(function (v) {
        return v.model
      })
      .filter(Boolean)
      .filter(function (model, index, all) {
        return all.indexOf(model) === index
      })
      .sort()
    fillSelect(
      modelSelect,
      models.map(function (model) {
        return { value: model, label: model }
      }),
      "Sin modelos",
    )
    refreshYears()
  }

  function refreshYears() {
    var make = makeSelect.value
    var model = modelSelect.value
    var vehicle = state.vehicles.find(function (v) {
      return v.make === make && v.model === model
    })
    if (!vehicle) {
      fillSelect(yearSelect, [], "Elige un modelo")
      return
    }
    var years = yearsOf(vehicle.year_range)
      .sort(function (a, b) {
        return b - a
      })
      .map(function (year) {
        return { value: String(year), label: String(year) }
      })
    fillSelect(yearSelect, years, "Sin años")
    calculate()
  }

  function median(values) {
    if (!values.length) return null
    var sorted = values.slice().sort(function (a, b) {
      return a - b
    })
    return sorted[Math.floor(sorted.length / 2)]
  }

  async function revistaFor(make, model, year) {
    var token = normalize(model).split(" ")[0]
    if (!token) return null
    var res = await fetch(
      CFG.supabaseUrl +
        "/rest/v1/vehicle_prices?select=make,model,year,value_cop&make=eq." +
        encodeURIComponent(make) +
        "&year=eq." +
        year +
        "&limit=1000",
      { headers: { apikey: CFG.supabaseKey, Authorization: "Bearer " + CFG.supabaseKey } },
    )
    if (!res.ok) return null
    var rows = await res.json()
    var values = rows
      .filter(function (row) {
        return normalize(row.model).indexOf(token) >= 0
      })
      .map(function (row) {
        return Number(row.value_cop)
      })
      .filter(function (value) {
        return value > 0
      })
    return median(values)
  }

  function confidenceLabel(value) {
    return { high: "Alta", medium: "Media", low: "Baja" }[value] || "Baja"
  }

  async function calculate() {
    var make = makeSelect.value
    var model = modelSelect.value
    var year = Number(yearSelect.value)
    if (!make || !model || !year) return

    var vehicle = state.vehicles.find(function (v) {
      return v.make === make && v.model === model
    })
    var kms = Number(kmsInput.value)
    var revista = await revistaFor(make, model, year)

    var estimate = EST.estimateFairPrice({
      make: make,
      year: year,
      condition: state.condition,
      kms: Number.isFinite(kms) && kms > 0 ? kms : undefined,
      revistaMotorPrice: revista || undefined,
      catalogMinPrice: vehicle && vehicle.min_price_cop ? vehicle.min_price_cop : undefined,
      catalogMaxPrice: vehicle && vehicle.max_price_cop ? vehicle.max_price_cop : undefined,
    })

    if (!estimate || estimate.estimatedPrice <= 0) {
      el("estimado").textContent = "—"
      el("rango").textContent = ""
      return
    }

    el("estimado").textContent = money.format(estimate.estimatedPrice)
    el("rango").textContent =
      "Rango " +
      money.format(estimate.priceRangeLow) +
      " – " +
      money.format(estimate.priceRangeHigh)
    el("revista").textContent = revista ? money.format(revista) : "Sin dato"
    el("catalogo").textContent =
      vehicle && vehicle.min_price_cop
        ? money.format(vehicle.min_price_cop) + " – " + money.format(vehicle.max_price_cop)
        : "Sin dato"
    el("confianza").textContent = confidenceLabel(estimate.confidence)

    if (window.posthog) {
      window.posthog.capture("web_fair_price_calculated", {
        make: make,
        model: model,
        year: year,
        confidence: estimate.confidence,
      })
    }
  }

  makeSelect.addEventListener("change", refreshModels)
  modelSelect.addEventListener("change", refreshYears)
  yearSelect.addEventListener("change", calculate)
  kmsInput.addEventListener("change", calculate)

  el("condicion").addEventListener("click", function (event) {
    var chip = event.target.closest("[data-condition]")
    if (!chip) return
    state.condition = chip.getAttribute("data-condition")
    for (var i = 0; i < el("condicion").children.length; i++) {
      var item = el("condicion").children[i]
      var active = item === chip
      item.setAttribute("aria-pressed", String(active))
      item.classList.toggle("on", active)
    }
    calculate()
  })

  loadVehicles()
    .then(function (vehicles) {
      state.vehicles = vehicles
      refreshMakes()
    })
    .catch(function () {
      makeSelect.innerHTML = ""
      makeSelect.appendChild(option("", "No pudimos cargar el catálogo"))
      makeSelect.disabled = true
    })
})()
