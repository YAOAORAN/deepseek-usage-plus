(function () {
  const HIT_LABEL = '输入（命中缓存）'
  const MISS_LABEL = '输入（未命中缓存）'

  function extractNumber(text) {
    const cleaned = text.replace(/,/g, '').trim()
    const match = cleaned.match(/^([\d]+(?:\.[\d]+)?)/)
    if (match) {
      return parseFloat(match[1])
    }
    return null
  }

  function findLabelsColumn() {
    const allTextNodes = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.parentElement && node.parentElement.closest('script, style, noscript')) {
          return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_ACCEPT
      },
    })
    let node
    while ((node = walker.nextNode())) {
      allTextNodes.push(node)
    }

    const hitLabels = allTextNodes.filter((n) => n.textContent.trim() === HIT_LABEL)
    const missLabels = allTextNodes.filter((n) => n.textContent.trim() === MISS_LABEL)

    const results = []
    for (const hitNode of hitLabels) {
      const hitLabelCol = hitNode.parentElement?.closest('[style*="flex-direction: column"]')
      if (!hitLabelCol) continue

      const missNode = missLabels.find((m) => {
        const missCol = m.parentElement?.closest('[style*="flex-direction: column"]')
        return missCol === hitLabelCol
      })
      if (!missNode) continue

      const valueCol = hitLabelCol.nextElementSibling
      if (!valueCol || !valueCol.querySelector('[style*="tabular-nums"]')) continue

      const children = Array.from(hitLabelCol.children)
      const hitIndex = children.indexOf(hitNode.parentElement)
      const missIndex = children.indexOf(missNode.parentElement)
      if (hitIndex === -1 || missIndex === -1) continue

      const valueChildren = Array.from(valueCol.children)
      const hitValueEl = valueChildren[hitIndex]
      const missValueEl = valueChildren[missIndex]
      if (!hitValueEl || !missValueEl) continue

      const hitText = hitValueEl.textContent || ''
      const missText = missValueEl.textContent || ''
      const hitNum = extractNumber(hitText)
      const missNum = extractNumber(missText)
      if (hitNum === null || missNum === null) continue

      results.push({
        hit: hitNum,
        miss: missNum,
        total: hitNum + missNum,
        labelCol: hitLabelCol,
        valueCol: valueCol,
      })
    }
    return results
  }

  function formatNumber(n) {
    return n.toLocaleString()
  }

  function injectRates() {
    const sections = findLabelsColumn()
    for (const section of sections) {
      if (section.total === 0) continue

      const uid = 'injected'
      if (section.labelCol.dataset[uid] && section.valueCol.dataset[uid]) {
        const existingLabel = section.labelCol.querySelector('.ds-cache-rate-label')
        const existingValue = section.valueCol.querySelector('.ds-cache-rate-value')
        if (existingLabel && existingValue) continue
      }

      const existingLabel = section.labelCol.querySelector('.ds-cache-rate-label')
      const existingValue = section.valueCol.querySelector('.ds-cache-rate-value')
      if (existingLabel) existingLabel.remove()
      if (existingValue) existingValue.remove()

      const rate = (section.hit / section.total) * 100
      const rateText = rate.toFixed(2) + '%'

      const labelRow = document.createElement('div')
      labelRow.className = 'ds-cache-rate-label'
      labelRow.style.cssText = `
        color: rgb(var(--ds-rgb-label-2));
        display: flex;
        align-items: center;
        font-family: inherit;
      `

      const dot = document.createElement('span')
      dot.style.cssText = `
        width: 12px;
        height: 12px;
        background: #60B3FE;
        margin-right: 8px;
        border-radius: 2px;
        display: inline-block;
        flex-shrink: 0;
      `

      const labelSpan = document.createElement('span')
      labelSpan.textContent = '缓存命中率'

      labelRow.appendChild(dot)
      labelRow.appendChild(labelSpan)

      const valueRow = document.createElement('div')
      valueRow.className = 'ds-cache-rate-value'
      valueRow.style.cssText = `
        color: #60B3FE;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        font-size: inherit;
      `

      const rateSpan = document.createElement('span')
      rateSpan.textContent = rateText

      const detailSpan = document.createElement('span')
      detailSpan.textContent = ` (${formatNumber(section.hit)} / ${formatNumber(section.total)})`
      detailSpan.style.cssText = `
        color: rgb(var(--ds-rgb-label-2));
        font-weight: 400;
        margin-left: 4px;
        opacity: 0.8;
        font-size: 0.9em;
      `

      valueRow.appendChild(rateSpan)
      valueRow.appendChild(detailSpan)

      section.labelCol.appendChild(labelRow)
      section.valueCol.appendChild(valueRow)

      section.labelCol.dataset[uid] = 'true'
      section.valueCol.dataset[uid] = 'true'
    }
  }

  let observer = null
  let retryCount = 0
  const MAX_RETRIES = 60

  function tryInject() {
    const check = findLabelsColumn()
    if (check.length === 0) return false
    injectRates()
    return true
  }

  function startObserver() {
    if (!window.location.href.includes('/usage')) return

    tryInject()

    if (observer) observer.disconnect()

    let debounceTimer = null
    observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const sections = findLabelsColumn()
        let needsInject = false
        for (const s of sections) {
          const uid = 'injected'
          if (!s.labelCol.dataset[uid] || !s.valueCol.dataset[uid]) {
            needsInject = true
            break
          }
          if (!s.labelCol.querySelector('.ds-cache-rate-label') || !s.valueCol.querySelector('.ds-cache-rate-value')) {
            needsInject = true
            break
          }
        }
        if (needsInject) {
          injectRates()
        }
      }, 300)
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    const pollTimer = setInterval(() => {
      retryCount++
      if (retryCount >= MAX_RETRIES) {
        clearInterval(pollTimer)
        return
      }

      const sections = findLabelsColumn()
      if (sections.length === 0) return

      let allInjected = true
      for (const s of sections) {
        const uid = 'injected'
        if (!s.labelCol.dataset[uid] || !s.valueCol.dataset[uid]) {
          allInjected = false
          break
        }
        if (!s.labelCol.querySelector('.ds-cache-rate-label') || !s.valueCol.querySelector('.ds-cache-rate-value')) {
          allInjected = false
          break
        }
      }
      if (allInjected) {
        clearInterval(pollTimer)
        return
      }
      injectRates()
    }, 2000)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver)
  } else {
    startObserver()
  }

  let lastUrl = window.location.href
  new MutationObserver(() => {
    const currentUrl = window.location.href
    if (currentUrl !== lastUrl && currentUrl.includes('/usage')) {
      lastUrl = currentUrl
      retryCount = 0
      document.querySelectorAll('[data-injected]').forEach((el) => {
        delete el.dataset.injected
      })
      document.querySelectorAll('.ds-cache-rate-label, .ds-cache-rate-value').forEach((el) => el.remove())
      setTimeout(startObserver, 500)
    }
  }).observe(document.querySelector('title') || document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })

})()
