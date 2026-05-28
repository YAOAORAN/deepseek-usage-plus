(function () {
  var HIT_COLOR = '#A0DCFD'
  var MISS_COLOR = '#60B3FE'

  function start() {
    process()
    estimateDays()
    var mo = new MutationObserver(function () {
      process()
      checkEstimate()
    })
    mo.observe(document.body, { childList: true, subtree: true })

    setInterval(function () {
      var changed = false
      var containers = document.querySelectorAll('[_echarts_instance_]')
      for (var ci = 0; ci < containers.length; ci++) {
        var container = containers[ci]
        if (container.__dsProcessed) {
          var svg = container.querySelector('svg')
          if (svg && svg.__dsContent !== svg.innerHTML) {
            container.__dsProcessed = false
            changed = true
          }
        }
      }
      if (changed) {
        var els = document.querySelectorAll('.__ds-week-card,.__ds-model-cost,.__ds-estimate,.__ds-legend')
        for (var ei = 0; ei < els.length; ei++) els[ei].remove()
        var group = document.querySelectorAll('g.ds-hit-group')
        for (var gi = 0; gi < group.length; gi++) group[gi].remove()
      }
      checkEstimate()
    }, 2000)
  }

  var _estThrottled = false
  function checkEstimate() {
    if (_estThrottled) return
    _estThrottled = true
    setTimeout(function () { _estThrottled = false }, 3000)
    estimateDays()
  }

  function tokenizePath(d) {
    var tokens = []
    var i = 0
    while (i < d.length) {
      var ch = d[i]
      if (ch >= 'A' && ch <= 'Z' || ch >= 'a' && ch <= 'z') {
        tokens.push(ch)
        i++
      } else if (ch === '-' || ch === '+' || ch === '.' || (ch >= '0' && ch <= '9')) {
        var num = ''
        while (i < d.length && (d[i] === '-' || d[i] === '+' || d[i] === '.' || d[i] === 'e' || d[i] === 'E' || (d[i] >= '0' && d[i] <= '9'))) {
          num += d[i]
          i++
        }
        if (num === '-') {
          tokens.push('-')
        } else if (num !== '') {
          tokens.push(parseFloat(num))
        }
      } else if (ch === ',') {
        i++
      } else if (ch === ' ') {
        i++
      } else {
        i++
      }
    }
    return tokens
  }

  function getMinYFromTokens(tokens) {
    var minY = Infinity
    var i = 0
    var cx = 0, cy = 0
    while (i < tokens.length) {
      var cmd = tokens[i]
      if (typeof cmd !== 'string') { i++; continue }
      if (cmd === 'M' || cmd === 'm') {
        var x = tokens[i+1], y = tokens[i+2]
        if (typeof x !== 'number' || typeof y !== 'number') { i += 3; continue }
        if (cmd === 'm') { cx += x; cy += y }
        else { cx = x; cy = y }
        if (cy < minY) minY = cy
        i += 3
      } else if (cmd === 'L' || cmd === 'l') {
        var x = tokens[i+1], y = tokens[i+2]
        if (typeof x !== 'number' || typeof y !== 'number') { i += 3; continue }
        if (cmd === 'l') { cx += x; cy += y }
        else { cx = x; cy = y }
        if (cy < minY) minY = cy
        i += 3
      } else if (cmd === 'H' || cmd === 'h') {
        var x = tokens[i+1]
        if (typeof x !== 'number') { i += 2; continue }
        if (cmd === 'h') cx += x
        else cx = x
        i += 2
      } else if (cmd === 'V' || cmd === 'v') {
        var y = tokens[i+1]
        if (typeof y !== 'number') { i += 2; continue }
        if (cmd === 'v') cy += y
        else cy = y
        if (cy < minY) minY = cy
        i += 2
      } else if (cmd === 'A' || cmd === 'a') {
        var x = tokens[i+6], y = tokens[i+7]
        if (typeof x !== 'number' || typeof y !== 'number') { i += 8; continue }
        if (cmd === 'a') { cx += x; cy += y }
        else { cx = x; cy = y }
        if (cy < minY) minY = cy
        i += 8
      } else if (cmd === 'Z' || cmd === 'z') {
        i++
      } else {
        i++
      }
    }
    return minY === Infinity ? null : minY
  }

  function getFirstYFromTokens(tokens) {
    for (var i = 0; i < tokens.length - 2; i++) {
      if (tokens[i] === 'M' && typeof tokens[i+1] === 'number' && typeof tokens[i+2] === 'number') {
        return tokens[i+2]
      }
      if (tokens[i] === 'm' && typeof tokens[i+1] === 'number' && typeof tokens[i+2] === 'number') {
        return null
      }
    }
    return null
  }

  function getXFromTokens(tokens) {
    for (var i = 0; i < tokens.length - 1; i++) {
      if (tokens[i] === 'M' && typeof tokens[i+1] === 'number') {
        return tokens[i+1]
      }
    }
    return 0
  }

  function process() {
    var containers = document.querySelectorAll('[_echarts_instance_]')
    for (var ci = 0; ci < containers.length; ci++) {
      var container = containers[ci]
      if (container.__dsProcessed) continue
      if (container.__dsProcessing) continue
      container.__dsProcessing = true
      var svg = container.querySelector('svg')
      if (!svg) { container.__dsProcessing = false; continue }
      var titleEl = container.closest('.ds-grid-item, [class*="ds-grid"] > div')
      if (!titleEl) { container.__dsProcessing = false; continue }
      var titleSpan = titleEl.querySelector('span.ds-text--fsp')
      if (!titleSpan || titleSpan.textContent.trim() !== 'Tokens') { container.__dsProcessing = false; continue }

      var hitData = extractBarData(svg)
      if (!hitData || hitData.length < 2) {
        container.__dsProcessing = false
        continue
      }

      addLegend(titleSpan, hitData)
      drawLine(svg, container, hitData)
      if (svg) svg.__dsContent = svg.innerHTML
      container.__dsProcessed = true
      container.__dsProcessing = false
    }
  }

  function extractBarData(svg) {
    var p1 = svg.querySelectorAll('path[fill="' + HIT_COLOR + '"]')
    if (p1.length === 0) p1 = svg.querySelectorAll('[fill="' + HIT_COLOR + '"]')
    if (p1.length === 0) return null

    var hitPaths = []
    for (var i = 0; i < p1.length; i++) {
      if (p1[i].tagName === 'path') hitPaths.push(p1[i])
    }
    if (hitPaths.length === 0) return null

    var p2 = svg.querySelectorAll('path[fill="' + MISS_COLOR + '"]')
    var missPaths = []
    for (var i = 0; i < p2.length; i++) {
      if (p2[i].tagName === 'path') missPaths.push(p2[i])
    }
    if (missPaths.length === 0) return null

    var chartRect = getChartRect(svg)
    if (!chartRect) return null

    var result = []
    for (var bi = 0; bi < hitPaths.length; bi++) {
      var hitTokens = tokenizePath(hitPaths[bi].getAttribute('d') || '')
      var missTokens = tokenizePath(missPaths[bi].getAttribute('d') || '')

      if (hitTokens.length < 3 || missTokens.length < 3) continue

      var hitTopY = getMinYFromTokens(hitTokens)
      var missTopY = getMinYFromTokens(missTokens)
      var missFirstY = getFirstYFromTokens(missTokens)
      var hitX = getXFromTokens(hitTokens)

      if (hitTopY === null || missTopY === null || missFirstY === null) continue

      var hitH = missTopY - hitTopY
      var missH = missFirstY - missTopY

      if (hitH + missH <= 0) continue

      var hitRate = (hitH / (hitH + missH)) * 100
      if (hitH <= 0) continue

      result.push({ rate: parseFloat(hitRate.toFixed(1)), x: hitX, y: hitTopY })
    }

    return result.length > 0 ? result : null
  }

  function getChartRect(svg) {
    try {
      var sh = parseFloat(svg.getAttribute('height') || '160')
      var bottomY = null, topY = null

      var gridLines = svg.querySelectorAll('path[fill="none"]')
      for (var i = 0; i < gridLines.length; i++) {
        var d = gridLines[i].getAttribute('d') || ''
        if (d.indexOf('L') === -1) continue
        var tokens = tokenizePath(d)
        var firstY = null, lastY = null
        for (var j = 0; j < tokens.length; j++) {
          if (tokens[j] === 'M' && typeof tokens[j+2] === 'number') {
            var y = tokens[j+2]
            if (firstY === null) firstY = y
            lastY = y
          }
        }
        if (firstY !== null && firstY === lastY && firstY > 0) {
          if (bottomY === null || firstY > bottomY) bottomY = firstY
          if (topY === null || firstY < topY) topY = firstY
        }
      }

      if (bottomY === null) bottomY = sh - 24
      if (topY === null) topY = 8

      return { top: topY - 2, bottom: bottomY + 2 }
    } catch (e) { return null }
  }

  function addLegend(titleSpan, data) {
    var sum = 0
    for (var i = 0; i < data.length; i++) sum += data[i].rate
    var avg = (sum / data.length).toFixed(1)

    var headerRow = titleSpan.parentElement
    if (!headerRow) return

    var existing = headerRow.querySelector('.__ds-legend')
    if (existing) existing.remove()

    var legend = document.createElement('span')
    legend.className = '__ds-legend'
    legend.style.cssText = 'margin-left:auto;color:#4ade80;font-weight:600;font-size:13px;white-space:nowrap;'
    legend.textContent = '缓存命中率 平均 ' + avg + '%'
    headerRow.appendChild(legend)
  }

  function drawLine(svg, container, data) {
    var chartRect = getChartRect(svg)
    if (!chartRect) return
    var chartH = chartRect.bottom - chartRect.top

    var existingG = svg.querySelector('g.ds-hit-group')
    if (existingG) existingG.remove()

    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('class', 'ds-hit-group')

    var sw = parseFloat(svg.getAttribute('width') || '436')

    var points = []
    for (var i = 0; i < data.length; i++) {
      var y = chartRect.top + chartH - (data[i].rate / 100) * chartH
      points.push({ x: data[i].x + 4, y: y, rate: data[i].rate })
    }

    var avg = 0
    for (var i = 0; i < points.length; i++) avg += points[i].rate
    avg = avg / points.length
    var avgY = chartRect.top + chartH - (avg / 100) * chartH

    var avgLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    avgLine.setAttribute('x1', data[0].x + 4)
    avgLine.setAttribute('y1', avgY)
    avgLine.setAttribute('x2', data[data.length - 1].x + 4)
    avgLine.setAttribute('y2', avgY)
    avgLine.setAttribute('stroke', 'rgba(74,222,128,0.35)')
    avgLine.setAttribute('stroke-width', '1')
    avgLine.setAttribute('stroke-dasharray', '4,3')
    g.appendChild(avgLine)

    var areaD = ''
    for (var i = 0; i < points.length; i++) {
      areaD += (i === 0 ? 'M' : 'L') + points[i].x.toFixed(1) + ',' + points[i].y.toFixed(1)
    }
    areaD += 'L' + points[points.length - 1].x.toFixed(1) + ',' + (chartRect.bottom) + ' L' + points[0].x.toFixed(1) + ',' + (chartRect.bottom) + ' Z'
    var area = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    area.setAttribute('d', areaD)
    area.setAttribute('fill', 'rgba(74,222,128,0.12)')
    g.appendChild(area)

    var pathD = ''
    for (var i = 0; i < points.length; i++) {
      pathD += (i === 0 ? 'M' : 'L') + points[i].x.toFixed(1) + ',' + points[i].y.toFixed(1)
    }
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    line.setAttribute('d', pathD)
    line.setAttribute('fill', 'none')
    line.setAttribute('stroke', '#4ade80')
    line.setAttribute('stroke-width', '2')
    line.setAttribute('stroke-linejoin', 'round')
    g.appendChild(line)

    for (var i = 0; i < points.length; i++) {
      var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      dot.setAttribute('cx', points[i].x.toFixed(1))
      dot.setAttribute('cy', points[i].y.toFixed(1))
      dot.setAttribute('r', '2')
      dot.setAttribute('fill', '#4ade80')
      dot.setAttribute('stroke', '#fff')
      dot.setAttribute('stroke-width', '1')
      g.appendChild(dot)
    }

    for (var gi = 0; gi <= 4; gi++) {
      var gy = chartRect.top + (gi / 4) * chartH
      var gl = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      gl.setAttribute('x1', sw - 14)
      gl.setAttribute('y1', gy)
      gl.setAttribute('x2', sw - 1)
      gl.setAttribute('y2', gy)
      gl.setAttribute('stroke', 'rgba(74,222,128,0.1)')
      gl.setAttribute('stroke-width', '1')
      g.appendChild(gl)
    }

    svg.appendChild(g)

    var tipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    tipRect.setAttribute('x', '0')
    tipRect.setAttribute('y', chartRect.top.toString())
    tipRect.setAttribute('width', sw.toString())
    tipRect.setAttribute('height', chartH.toString())
    tipRect.setAttribute('fill', 'transparent')
    tipRect.style.cursor = 'crosshair'

    var tipLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    tipLine.setAttribute('y1', chartRect.top.toString())
    tipLine.setAttribute('y2', chartRect.bottom.toString())
    tipLine.setAttribute('stroke', 'rgba(74,222,128,0.5)')
    tipLine.setAttribute('stroke-width', '1')
    tipLine.setAttribute('stroke-dasharray', '3,2')
    tipLine.style.display = 'none'

    var tipText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    tipText.setAttribute('fill', '#4ade80')
    tipText.setAttribute('font-size', '11')
    tipText.setAttribute('font-weight', 'bold')

    svg.appendChild(tipLine)
    svg.appendChild(tipRect)
    svg.appendChild(tipText)

    tipRect.addEventListener('mousemove', function (e) {
      var svgRect = svg.getBoundingClientRect()
      var mx = e.clientX - svgRect.left
      var closest = null, minDist = Infinity
      for (var pi = 0; pi < points.length; pi++) {
        var dist = Math.abs(points[pi].x - mx)
        if (dist < minDist) { minDist = dist; closest = pi }
      }
      if (closest !== null && minDist < 20) {
        tipLine.setAttribute('x1', points[closest].x.toFixed(1))
        tipLine.setAttribute('x2', points[closest].x.toFixed(1))
        tipLine.style.display = ''
        tipText.textContent = points[closest].rate + '%'
        tipText.setAttribute('x', (points[closest].x - 12).toString())
        tipText.setAttribute('y', (points[closest].y - 8).toString())
      } else {
        tipLine.style.display = 'none'
        tipText.textContent = ''
      }
    })
    tipRect.addEventListener('mouseleave', function () {
      tipLine.style.display = 'none'
      tipText.textContent = ''
    })
  }

  function estimateDays() {
    var costSvg = findCostChart()
    if (!costSvg) return

    var costData = extractCostData(costSvg)
    if (!costData || costData.length < 2) return

    addWeekCard(costData)
    try { addModelBreakdown() } catch (e) {}

    var existing = document.querySelector('.__ds-estimate')
    if (existing) return

    var recent7 = costData.slice(-7)
    var sum = 0
    for (var i = 0; i < recent7.length; i++) sum += recent7[i]
    var dailyAvg = sum / recent7.length
    if (dailyAvg <= 0) return

    var balance = findBalance()
    if (balance === null || balance <= 0) return

    var days = Math.floor((balance / dailyAvg) * 10) / 10
    if (days <= 0) days = 0.1

    var balanceCard = findBalanceCard()
    if (!balanceCard) return

    var label = document.createElement('div')
    label.className = '__ds-estimate'
    label.style.cssText = 'margin-top:6px;color:rgb(var(--ds-rgb-label-2));font-size:12px;white-space:nowrap;'
    label.textContent = '预计可用 ' + days + ' 天 | 近7日日均 ¥' + dailyAvg.toFixed(2)
    balanceCard.appendChild(label)
  }

  function addWeekCard(costData) {
    if (document.querySelector('.__ds-week-card')) return

    var monthConsumeEl = null
    var allDivs = document.querySelectorAll('div._477051d')
    for (var di = 0; di < allDivs.length; di++) {
      if (allDivs[di].textContent.trim() === '本月消费') {
        monthConsumeEl = allDivs[di]
        break
      }
    }
    if (!monthConsumeEl) return

    var card = monthConsumeEl.closest('.a0cde8c1')
    if (!card) return
    var grid = card.parentElement
    if (!grid) return

    var weekTotal = 0
    var recent7 = costData.slice(-7)
    for (var i = 0; i < recent7.length; i++) weekTotal += recent7[i]

    var prev7Total = 0
    var prevTotal = 0
    if (costData.length >= 14) {
      var prev7 = costData.slice(-14, -7)
      for (var i = 0; i < prev7.length; i++) prev7Total += prev7[i]
    }

    var clone = card.cloneNode(true)
    clone.className = '__ds-week-card'
    var titleEl = clone.querySelector('div._477051d')
    if (titleEl) titleEl.textContent = '本周消费'

    var valueTextEl = clone.querySelector('._7ed1d04 span:last-child')
    if (valueTextEl) valueTextEl.textContent = weekTotal.toFixed(2)

    var cnyEl = clone.querySelector('._1ef3557')
    if (cnyEl) cnyEl.textContent = 'CNY'

    grid.appendChild(clone)

    if (prev7Total > 0) {
      var changeText = document.createElement('div')
      var changeRate = ((weekTotal - prev7Total) / prev7Total * 100).toFixed(1)
      var color = changeRate > 0 ? '#ef4444' : changeRate < 0 ? '#4ade80' : 'rgb(var(--ds-rgb-label-2))'
      var arrow = changeRate > 0 ? '↑' : changeRate < 0 ? '↓' : ''
      changeText.style.cssText = 'font-size:12px;color:' + color + ';margin-top:4px;font-weight:500;'
      changeText.textContent = arrow + Math.abs(changeRate) + '% vs 上周'
      clone.appendChild(changeText)
    }
  }

  function extractTokenTotals(svg) {
    var p1 = svg.querySelectorAll('path[fill="' + HIT_COLOR + '"]')
    if (p1.length === 0) p1 = svg.querySelectorAll('[fill="' + HIT_COLOR + '"]')
    if (p1.length === 0) return null
    var hitPaths = []
    for (var i = 0; i < p1.length; i++) {
      if (p1[i].tagName === 'path') hitPaths.push(p1[i])
    }
    if (hitPaths.length === 0) return null

    var p2 = svg.querySelectorAll('path[fill="' + MISS_COLOR + '"]')
    var missPaths = []
    for (var i = 0; i < p2.length; i++) {
      if (p2[i].tagName === 'path') missPaths.push(p2[i])
    }
    if (missPaths.length === 0) return null

    var chartRect = getChartRect(svg)
    if (!chartRect) return null
    var chartH = chartRect.bottom - chartRect.top

    var maxLabel = findMaxCostLabel(svg)
    if (maxLabel === null) return null
    var actualChartH = chartH - 4

    var total = 0
    var minLen = Math.min(hitPaths.length, missPaths.length)
    for (var bi = 0; bi < minLen; bi++) {
      var hitTokens = tokenizePath(hitPaths[bi].getAttribute('d') || '')
      var missTokens = tokenizePath(missPaths[bi].getAttribute('d') || '')
      if (hitTokens.length < 3 || missTokens.length < 3) continue
      var hitTopY = getMinYFromTokens(hitTokens)
      var missFirstY = getFirstYFromTokens(missTokens)
      if (hitTopY === null || missFirstY === null) continue
      var totalH = missFirstY - hitTopY
      if (totalH < 4) continue
      var ratio = (totalH - 2) / actualChartH
      if (ratio < 0.01) continue
      var v = ratio * maxLabel
      if (v > maxLabel * 1.1) continue
      total += v
    }
    return total
  }

  function addModelBreakdown() {
    if (document.querySelector('.__ds-model-cost')) return

    var containers = document.querySelectorAll('[_echarts_instance_]')
    var apiContainers = []
    var tokenContainers = []
    for (var ci = 0; ci < containers.length; ci++) {
      var titleEl = containers[ci].closest('.ds-grid-item, [class*="ds-grid"] > div')
      if (!titleEl) continue
      var titleSpan = titleEl.querySelector('span.ds-text--fsp')
      if (!titleSpan) continue
      var text = titleSpan.textContent.trim()
      if (text === 'API 请求次数') apiContainers.push({ container: containers[ci], gridItem: titleEl })
      else if (text === 'Tokens') tokenContainers.push({ container: containers[ci], gridItem: titleEl })
    }
    if (apiContainers.length === 0 || tokenContainers.length === 0) return

    var models = []
    var minPair = Math.min(apiContainers.length, tokenContainers.length)
    for (var mi = 0; mi < minPair; mi++) {
      var apiSvg = apiContainers[mi].container.querySelector('svg')
      var tokenSvg = tokenContainers[mi].container.querySelector('svg')
      if (!apiSvg || !tokenSvg) continue
      var tokenTotal = extractTokenTotals(tokenSvg)
      if (tokenTotal === null || tokenTotal <= 0) continue
      var labelEl = apiContainers[mi].gridItem.querySelector('[class*="ds-text--label"]')
      var modelName = labelEl && labelEl.textContent.trim() ? labelEl.textContent.trim() : 'Model ' + (mi + 1)
      models.push({ index: mi, tokens: tokenTotal, name: modelName, gridItem: apiContainers[mi].gridItem })
    }
    if (models.length === 0) return

    var allTokens = 0
    for (var mi = 0; mi < models.length; mi++) allTokens += models[mi].tokens

    var totalConsume = 0
    try {
      var costChartSpans = document.querySelectorAll('span.ds-text--fsp')
      for (var si = 0; si < costChartSpans.length; si++) {
        if (costChartSpans[si].textContent.trim() === '消费金额') {
          var costRow = costChartSpans[si].parentElement
          var costText = costRow ? costRow.textContent : ''
          var cm = costText.match(/消费金额.*?¥?([\d,]+(?:\.\d{2})?)/)
          if (cm) totalConsume = parseFloat(cm[1].replace(/,/g, ''))
          break
        }
      }
    } catch (e) {}
    if (totalConsume <= 0) {
      var costSvg = findCostChart();
      try { var cd = extractCostData(costSvg); if (cd) for (var i = 0; i < cd.length; i++) totalConsume += cd[i] } catch (e) {}
    }
    if (totalConsume <= 0) return

    for (var mi = 0; mi < models.length; mi++) {
      var ratio = models[mi].tokens / allTokens
      var cost = totalConsume * ratio
      var pct = (ratio * 100).toFixed(1)

      var labelEl = models[mi].gridItem.querySelector('[class*="ds-text--label"]')
      if (!labelEl) continue

      var existing = models[mi].gridItem.querySelector('.__ds-model-cost')
      if (existing) continue

      var span = document.createElement('span')
      span.className = '__ds-model-cost'
      span.style.cssText = 'font-size:13px;color:rgb(var(--ds-rgb-label-2));margin-left:12px;font-weight:500;white-space:nowrap;'
      span.textContent = '约 ¥' + cost.toFixed(2) + ' (' + pct + '%)'
      labelEl.parentElement.appendChild(span)
    }
  }

  function findBalanceCard() {
    var allSpans = document.querySelectorAll('span')
    for (var si = 0; si < allSpans.length; si++) {
      if (allSpans[si].textContent.trim() === '充值余额') {
        var card = allSpans[si].closest('.a0cde8c1')
        if (!card) continue
        var valueContainer = card.querySelector('.abf3dfef > div')
        if (!valueContainer) continue
        return valueContainer
      }
    }
    return null
  }

  function findCostChart() {
    var spans = document.querySelectorAll('span.ds-text--fsp')
    for (var si = 0; si < spans.length; si++) {
      if (spans[si].textContent.trim() === '消费金额') {
        var gridItem = spans[si].closest('.ds-grid-item')
        if (!gridItem) continue
        var svg = gridItem.querySelector('svg')
        return svg
      }
    }
    return null
  }

  function extractCostData(svg) {
    var allPaths = svg.querySelectorAll('path')
    var barPaths = []
    for (var i = 0; i < allPaths.length; i++) {
      var fill = allPaths[i].getAttribute('fill') || ''
      var d = allPaths[i].getAttribute('d') || ''
      if (fill === 'none' || fill === 'transparent' || fill.indexOf('rgba') === 0) continue
      if (d.indexOf('L') === -1) continue
      if (d.match(/^M[\d.\s]+L[\d.\s]+$/)) continue
      barPaths.push(allPaths[i])
    }
    if (barPaths.length === 0) return null

    var chartRect = getChartRect(svg)
    if (!chartRect) return null
    var chartH = chartRect.bottom - chartRect.top

    var maxLabel = findMaxCostLabel(svg)
    if (maxLabel === null) return null

    var result = []
    var actualChartH = chartH - 4
    for (var i = 0; i < barPaths.length; i++) {
      var tokens = tokenizePath(barPaths[i].getAttribute('d') || '')
      if (tokens.length < 3) continue
      var topY = getMinYFromTokens(tokens)
      if (topY === null) continue
      var barH = chartRect.bottom - topY
      if (barH < 4) continue
      var ratio = (barH - 2) / actualChartH
      if (ratio < 0.01) continue
      var value = ratio * maxLabel
      if (value > maxLabel * 1.1) continue
      result.push(value)
    }

    return result.length > 0 ? result : null
  }

  function findMaxCostLabel(svg) {
    var texts = svg.querySelectorAll('text')
    var maxVal = 0
    for (var i = 0; i < texts.length; i++) {
      var txt = texts[i].textContent
      if (!txt) continue
      if (txt.match(/^\d{1,2}[\/\-]/)) continue
      var m = txt.match(/¥?([\d,]+(?:\.\d+)?)([KkMm])?/)
      if (m) {
        var num = parseFloat(m[1].replace(/,/g, ''))
        if (!isNaN(num)) {
          var suffix = (m[2] || '').toLowerCase()
          if (suffix === 'k') num *= 1000
          else if (suffix === 'm') num *= 1000000
          if (num > maxVal) maxVal = num
        }
      }
    }
    return maxVal > 0 ? maxVal : null
  }

  function findBalance() {
    var allSpans = document.querySelectorAll('span')
    for (var si = 0; si < allSpans.length; si++) {
      if (allSpans[si].textContent.trim() === '充值余额') {
        var card = allSpans[si].closest('.a0cde8c1')
        if (!card) break
        var valueEl = card.querySelector('._7ed1d04 span:last-child, [class*="_7ed"] span:last-child')
        if (valueEl) {
          var v = parseFloat(valueEl.textContent.replace(/,/g, ''))
          if (!isNaN(v) && v > 0) return v
        }
      }
    }
    return null
  }

  var retries = 0
  function retry() {
    retries++
    if (retries < 40) {
      process()
      checkEstimate()
      setTimeout(retry, 2000)
    }
  }
  setTimeout(retry, 500)
  start()
})()
