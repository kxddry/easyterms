// Content script to detect terms of use links and content
;(() => {
  // Deep logging system
  const LOG_PREFIX = "[TERMS-SUMMARIZER]"
  const DEBUG_MODE = true

  function deepLog(category, message, data = null) {
    if (!DEBUG_MODE) return

    const timestamp = new Date().toISOString()
    const logMessage = `${LOG_PREFIX} [${category}] ${timestamp}: ${message}`

    if (data) {
      console.group(logMessage)
      console.log("Data:", data)
      console.trace("Stack trace")
      console.groupEnd()
    } else {
      console.log(logMessage)
    }
  }

  // Add debug indicator to page
  function addDebugIndicator() {
    const indicator = document.createElement("div")
    indicator.className = "terms-debug-indicator"
    indicator.textContent = "Terms Debug ON"
    document.body.appendChild(indicator)
    setTimeout(() => indicator.remove(), 3000)
    deepLog("DEBUG", "Debug indicator added to page")
  }

  let isProcessing = false
  let termsPopup = null
  let highlightedLinks = []
  let isDragging = false
  let isMinimized = false
  let isMaximized = false
  let originalSize = { width: 320, height: 200 }
  let originalPosition = { top: 0, left: 0 }
  const dragOffset = { x: 0, y: 0 }
  const chrome = window.chrome

  deepLog("INIT", "Content script initializing", {
    url: window.location.href,
    readyState: document.readyState,
    chrome: !!chrome,
  })

  // Terms-related keywords to search for
  const termsKeywords = ["terms", "privacy policy"]
  deepLog("CONFIG", "Terms keywords configured", termsKeywords)

  // Window persistence
  const STORAGE_KEY = "terms-summarizer-window-state"

  function saveWindowState() {
    if (!termsPopup) return

    const state = {
      width: termsPopup.offsetWidth,
      height: termsPopup.offsetHeight,
      top: Number.parseInt(termsPopup.style.top),
      left: Number.parseInt(termsPopup.style.left),
      isMinimized,
      isMaximized,
      timestamp: Date.now(),
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    deepLog("PERSISTENCE", "Window state saved", state)
  }

  function loadWindowState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) {
        deepLog("PERSISTENCE", "No saved window state found")
        return null
      }

      const state = JSON.parse(saved)
      const age = Date.now() - (state.timestamp || 0)

      // Expire state after 24 hours
      if (age > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY)
        deepLog("PERSISTENCE", "Window state expired, removed", { age })
        return null
      }

      deepLog("PERSISTENCE", "Window state loaded", state)
      return state
    } catch (error) {
      deepLog("ERROR", "Failed to load window state", error)
      return null
    }
  }

  // Function to safely set innerHTML with TrustedHTML
  function safeSetInnerHTML(element, htmlString) {
    deepLog("SECURITY", "Setting innerHTML safely", {
      elementTag: element.tagName,
      htmlLength: htmlString.length,
      hasTrustedTypes: !!(window.trustedTypes && window.trustedTypes.createPolicy),
    })

    try {
      if (window.trustedTypes && window.trustedTypes.createPolicy) {
        const policy = window.trustedTypes.createPolicy("terms-summarizer", {
          createHTML: (string) => {
            deepLog("SECURITY", "TrustedHTML policy applied", { stringLength: string.length })
            return string
          },
        })
        element.innerHTML = policy.createHTML(htmlString)
        deepLog("SECURITY", "TrustedHTML assignment successful")
      } else {
        element.innerHTML = htmlString
        deepLog("SECURITY", "Fallback innerHTML assignment used")
      }
    } catch (error) {
      deepLog("ERROR", "Failed to set innerHTML", error)
      throw error
    }
  }

  // Function to convert basic markdown to HTML
  function parseMarkdown(text) {
    deepLog("MARKDOWN", "Parsing markdown", { inputLength: text?.length || 0 })

    if (!text) {
      deepLog("MARKDOWN", "No text to parse")
      return text
    }

    try {
      const result = text
        // Headers
        .replace(/^### (.*$)/gim, "<h3>$1</h3>")
        .replace(/^## (.*$)/gim, "<h2>$1</h2>")
        .replace(/^# (.*$)/gim, "<h1>$1</h1>")

        // Bold
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/__(.*?)__/g, "<strong>$1</strong>")

        // Italic
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/_(.*?)_/g, "<em>$1</em>")

        // Code blocks
        .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
        .replace(/`(.*?)`/g, "<code>$1</code>")

        // Unordered lists
        .replace(/^\* (.*$)/gim, "<li>$1</li>")
        .replace(/^- (.*$)/gim, "<li>$1</li>")

        // Ordered lists
        .replace(/^\d+\. (.*$)/gim, "<li>$1</li>")

        // Wrap consecutive list items in ul/ol tags
        .replace(/(<li>.*<\/li>)/gs, (match) => {
          const isOrdered = /^\d+\./.test(match.split("<li>")[1])
          const tag = isOrdered ? "ol" : "ul"
          return `<${tag}>${match}</${tag}>`
        })

        // Line breaks
        .replace(/\n\n/g, "</p><p>")
        .replace(/\n/g, "<br>")

        // Wrap in paragraphs if not already wrapped
        .replace(/^(?!<[h|u|o|p|d])/gm, "<p>")
        .replace(/(?<!>)$/gm, "</p>")

        // Clean up empty paragraphs
        .replace(/<p><\/p>/g, "")
        .replace(/<p>(<[h|u|o])/g, "$1")
        .replace(/(<\/[h|u|o]>)<\/p>/g, "$1")

      deepLog("MARKDOWN", "Markdown parsing completed", {
        inputLength: text.length,
        outputLength: result.length,
      })
      return result
    } catch (error) {
      deepLog("ERROR", "Markdown parsing failed", error)
      return text
    }
  }

  // Function to find terms-related links
  function findTermsLinks() {
    deepLog("DETECTION", "Starting terms link detection")

    const links = document.querySelectorAll("a[href]")
    const termsLinks = []

    deepLog("DETECTION", "Found links on page", { totalLinks: links.length })

    links.forEach((link, index) => {
      const linkText = link.textContent.toLowerCase().trim()
      const href = link.href.toLowerCase()

      deepLog("DETECTION", `Checking link ${index + 1}`, {
        text: linkText,
        href: href,
        element: link,
      })

      for (const keyword of termsKeywords) {
        if (linkText.includes(keyword) || href.includes(keyword.replace(/\s+/g, "-"))) {
          const termsLink = {
            element: link,
            text: link.textContent.trim(),
            url: link.href,
            keyword: keyword,
          }
          termsLinks.push(termsLink)
          deepLog("DETECTION", `Terms link found with keyword "${keyword}"`, termsLink)
          break
        }
      }
    })

    deepLog("DETECTION", "Terms link detection completed", {
      foundLinks: termsLinks.length,
      links: termsLinks.map((l) => ({ text: l.text, url: l.url, keyword: l.keyword })),
    })

    return termsLinks
  }

  // Function to extract text content from terms page
  async function extractTermsContent(url) {
    deepLog("EXTRACTION", "Starting content extraction", { url })

    try {
      deepLog("EXTRACTION", "Fetching URL")
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      deepLog("EXTRACTION", "Fetch successful", {
        status: response.status,
        contentType: response.headers.get("content-type"),
      })

      const html = await response.text()
      deepLog("EXTRACTION", "HTML received", { htmlLength: html.length })

      const parser = new DOMParser()
      const doc = parser.parseFromString(html, "text/html")
      deepLog("EXTRACTION", "HTML parsed successfully")

      // Remove script and style elements
      const scripts = doc.querySelectorAll("script, style, nav, header, footer")
      deepLog("EXTRACTION", "Removing unwanted elements", { elementsToRemove: scripts.length })
      scripts.forEach((el) => el.remove())

      // Get main content
      const selectors = ["article", "main", ".content", "body"]
      let content = ""

      for (const selector of selectors) {
        const element = doc.querySelector(selector)
        if (element) {
          content = element.innerText.trim()
          deepLog("EXTRACTION", `Content found with selector "${selector}"`, {
            contentLength: content.length,
            preview: content.substring(0, 200) + "...",
          })
          break
        }
      }

      if (!content) {
        throw new Error("Could not extract content from terms page")
      }

      deepLog("EXTRACTION", "Content extraction completed successfully", {
        finalContentLength: content.length,
      })
      return content
    } catch (error) {
      deepLog("ERROR", "Content extraction failed", { url, error: error.message })
      return ""
    }
  }

  // Function to get optimal popup position
  function getPopupPosition(referenceElement) {
    deepLog("POSITIONING", "Calculating popup position", { referenceElement })

    const rect = referenceElement.getBoundingClientRect()
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft

    const popupWidth = 320
    const popupHeight = 200
    const margin = 10

    let top = rect.bottom + scrollTop + margin
    let left = rect.left + scrollLeft

    // Adjust if popup would go off-screen horizontally
    if (left + popupWidth > window.innerWidth + scrollLeft) {
      left = window.innerWidth + scrollLeft - popupWidth - margin
      deepLog("POSITIONING", "Adjusted horizontal position to prevent overflow")
    }

    // Adjust if popup would go off-screen vertically
    if (top + popupHeight > window.innerHeight + scrollTop) {
      top = rect.top + scrollTop - popupHeight - margin
      deepLog("POSITIONING", "Adjusted vertical position to prevent overflow")
    }

    // Ensure minimum margins
    left = Math.max(scrollLeft + margin, left)
    top = Math.max(scrollTop + margin, top)

    const position = { top, left }
    deepLog("POSITIONING", "Final position calculated", position)
    return position
  }

  // Function to highlight terms links
  function highlightTermsLinks(termsLinks) {
    deepLog("HIGHLIGHT", "Highlighting terms links", { count: termsLinks.length })

    highlightedLinks = termsLinks.map((link) => link.element)
    highlightedLinks.forEach((element, index) => {
      element.classList.add("terms-link-highlighted")
      deepLog("HIGHLIGHT", `Link ${index + 1} highlighted`, { element })
    })

    deepLog("HIGHLIGHT", "All links highlighted successfully")
  }

  // Function to remove highlights
  function removeHighlights() {
    deepLog("HIGHLIGHT", "Removing highlights", { count: highlightedLinks.length })

    highlightedLinks.forEach((element, index) => {
      element.classList.remove("terms-link-highlighted")
      deepLog("HIGHLIGHT", `Highlight removed from link ${index + 1}`)
    })
    highlightedLinks = []

    deepLog("HIGHLIGHT", "All highlights removed")
  }

  // Keyboard event handler
  function handleKeyDown(event) {
    if (!termsPopup) return

    deepLog("KEYBOARD", "Key pressed", {
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
    })

    switch (event.key) {
      case "Escape":
        deepLog("KEYBOARD", "Escape key pressed - closing popup")
        closePopup()
        event.preventDefault()
        break
      case "Enter":
        if (event.ctrlKey) {
          deepLog("KEYBOARD", "Ctrl+Enter pressed - triggering summarize")
          const summarizeBtn = termsPopup.querySelector(".terms-summarizer-summarize")
          if (summarizeBtn && !summarizeBtn.disabled) {
            summarizeBtn.click()
          }
          event.preventDefault()
        }
        break
      case "a":
        if (event.ctrlKey) {
          deepLog("KEYBOARD", "Ctrl+A pressed - selecting all checkboxes")
          const checkboxes = termsPopup.querySelectorAll('input[type="checkbox"]')
          checkboxes.forEach((cb) => (cb.checked = true))
          event.preventDefault()
        }
        break
    }
  }

  // Function to handle drag functionality
  function initializeDrag(popup, header) {
    deepLog("DRAG", "Initializing drag functionality")

    header.addEventListener("mousedown", startDrag)

    function startDrag(e) {
      if (e.target.closest(".terms-window-controls")) {
        deepLog("DRAG", "Drag ignored - clicked on window controls")
        return
      }

      isDragging = true
      const rect = popup.getBoundingClientRect()
      dragOffset.x = e.clientX - rect.left
      dragOffset.y = e.clientY - rect.top

      deepLog("DRAG", "Drag started", {
        mouseX: e.clientX,
        mouseY: e.clientY,
        offsetX: dragOffset.x,
        offsetY: dragOffset.y,
      })

      document.addEventListener("mousemove", drag)
      document.addEventListener("mouseup", stopDrag)
      e.preventDefault()
    }

    function drag(e) {
      if (!isDragging) return

      const newLeft = e.clientX - dragOffset.x
      const newTop = e.clientY - dragOffset.y

      const constrainedLeft = Math.max(0, Math.min(window.innerWidth - popup.offsetWidth, newLeft))
      const constrainedTop = Math.max(0, Math.min(window.innerHeight - popup.offsetHeight, newTop))

      popup.style.left = constrainedLeft + "px"
      popup.style.top = constrainedTop + "px"

      deepLog("DRAG", "Dragging", {
        newLeft: constrainedLeft,
        newTop: constrainedTop,
      })
    }

    function stopDrag() {
      if (isDragging) {
        deepLog("DRAG", "Drag stopped")
        isDragging = false
        saveWindowState()
      }
      document.removeEventListener("mousemove", drag)
      document.removeEventListener("mouseup", stopDrag)
    }
  }

  // Window control functions
  function minimizeWindow() {
    deepLog("WINDOW", "Minimizing window")

    if (!isMinimized) {
      originalSize = {
        width: termsPopup.offsetWidth,
        height: termsPopup.offsetHeight,
      }
      isMinimized = true
      termsPopup.classList.add("minimized")
      saveWindowState()
      deepLog("WINDOW", "Window minimized", originalSize)
    }
  }

  function maximizeWindow() {
    deepLog("WINDOW", "Toggling maximize state", { currentlyMaximized: isMaximized })

    if (!isMaximized) {
      originalSize = {
        width: termsPopup.offsetWidth,
        height: termsPopup.offsetHeight,
      }
      originalPosition = {
        top: Number.parseInt(termsPopup.style.top),
        left: Number.parseInt(termsPopup.style.left),
      }
      isMaximized = true
      termsPopup.classList.add("maximized")
      termsPopup.style.top = "5vh"
      termsPopup.style.left = "5vw"
      deepLog("WINDOW", "Window maximized", { originalSize, originalPosition })
    } else {
      isMaximized = false
      termsPopup.classList.remove("maximized")
      termsPopup.style.width = originalSize.width + "px"
      termsPopup.style.height = originalSize.height + "px"
      termsPopup.style.top = originalPosition.top + "px"
      termsPopup.style.left = originalPosition.left + "px"
      deepLog("WINDOW", "Window restored", { originalSize, originalPosition })
    }
    saveWindowState()
  }

  function restoreWindow() {
    deepLog("WINDOW", "Restoring window from minimized state")

    if (isMinimized) {
      isMinimized = false
      termsPopup.classList.remove("minimized")
      saveWindowState()
      deepLog("WINDOW", "Window restored from minimized")
    }
  }

  // Function to create and show the terms popup
  function showTermsPopup(termsLinks) {
    deepLog("POPUP", "Creating terms popup", { linksCount: termsLinks.length })

    if (termsPopup) {
      deepLog("POPUP", "Popup already exists, aborting")
      return
    }

    // Highlight the found links
    highlightTermsLinks(termsLinks)

    // Find the first terms link to position popup near it
    const firstLink = termsLinks[0].element
    let position = getPopupPosition(firstLink)

    // Check for saved window state
    const savedState = loadWindowState()
    if (savedState) {
      position = { top: savedState.top, left: savedState.left }
      deepLog("POPUP", "Using saved position", position)
    }

    termsPopup = document.createElement("div")
    termsPopup.className = "terms-summarizer-popup"
    termsPopup.style.top = position.top + "px"
    termsPopup.style.left = position.left + "px"

    // Apply saved state
    if (savedState) {
      termsPopup.style.width = savedState.width + "px"
      termsPopup.style.height = savedState.height + "px"
      isMinimized = savedState.isMinimized || false
      isMaximized = savedState.isMaximized || false

      if (isMinimized) termsPopup.classList.add("minimized")
      if (isMaximized) termsPopup.classList.add("maximized")

      deepLog("POPUP", "Applied saved window state", savedState)
    }

    const popupHTML = `
      <div class="terms-summarizer-header">
        <h3>Terms Found</h3>
        <div class="terms-window-controls">
          <button class="terms-window-btn terms-minimize-btn" title="Minimize">−</button>
          <button class="terms-window-btn terms-maximize-btn" title="Maximize/Restore">□</button>
          <button class="terms-window-btn terms-close-btn" title="Close">×</button>
        </div>
      </div>
      <div class="terms-summarizer-body">
        <p>Found ${termsLinks.length} terms document${termsLinks.length > 1 ? "s" : ""}:</p>
        <div class="terms-selection-controls">
          <button class="terms-selection-btn" id="select-all">All</button>
          <button class="terms-selection-btn" id="select-none">None</button>
        </div>
        <ul class="terms-links-list">
          ${termsLinks
            .map(
              (link, index) => `
            <li>
              <label>
                <input type="checkbox" value="${index}" checked>
                <span>${link.text}</span>
              </label>
            </li>
          `,
            )
            .join("")}
        </ul>
        <p style="font-size: 11px; color: #888;">Summarize selected terms? (Ctrl+Enter to summarize, Escape to close)</p>
      </div>
      <div class="terms-summarizer-footer">
        <button class="terms-summarizer-btn terms-summarizer-cancel">Dismiss</button>
        <button class="terms-summarizer-btn terms-summarizer-summarize">Summarize</button>
      </div>
      <div class="terms-summarizer-loading" style="display: none;">
        <p style="font-size: 12px; margin: 0 0 8px 0;">Analyzing terms...</p>
        <div class="terms-summarizer-spinner"></div>
      </div>
      <div class="terms-summarizer-result" style="display: none;">
        <h4>Summary:</h4>
        <div class="terms-summary-content"></div>
      </div>
    `

    try {
      safeSetInnerHTML(termsPopup, popupHTML)
      document.body.appendChild(termsPopup)
      deepLog("POPUP", "Popup added to DOM successfully")
    } catch (error) {
      deepLog("ERROR", "Failed to create popup", error)
      return
    }

    // Initialize drag functionality
    const header = termsPopup.querySelector(".terms-summarizer-header")
    initializeDrag(termsPopup, header)

    // Add keyboard event listener
    document.addEventListener("keydown", handleKeyDown)
    deepLog("POPUP", "Keyboard event listener added")

    // Event listeners
    const closeBtn = termsPopup.querySelector(".terms-close-btn")
    const minimizeBtn = termsPopup.querySelector(".terms-minimize-btn")
    const maximizeBtn = termsPopup.querySelector(".terms-maximize-btn")
    const cancelBtn = termsPopup.querySelector(".terms-summarizer-cancel")
    const summarizeBtn = termsPopup.querySelector(".terms-summarizer-summarize")
    const selectAllBtn = termsPopup.querySelector("#select-all")
    const selectNoneBtn = termsPopup.querySelector("#select-none")

    // Window controls
    closeBtn.addEventListener("click", () => {
      deepLog("POPUP", "Close button clicked")
      closePopup()
    })

    minimizeBtn.addEventListener("click", (e) => {
      deepLog("POPUP", "Minimize button clicked")
      e.stopPropagation()
      if (isMinimized) {
        restoreWindow()
      } else {
        minimizeWindow()
      }
    })

    maximizeBtn.addEventListener("click", (e) => {
      deepLog("POPUP", "Maximize button clicked")
      e.stopPropagation()
      maximizeWindow()
    })

    // Action buttons
    cancelBtn.addEventListener("click", () => {
      deepLog("POPUP", "Cancel button clicked")
      closePopup()
    })
    summarizeBtn.addEventListener("click", () => {
      deepLog("POPUP", "Summarize button clicked")
      handleSummarize()
    })

    // Selection buttons
    selectAllBtn.addEventListener("click", () => {
      deepLog("POPUP", "Select All button clicked")
      const checkboxes = termsPopup.querySelectorAll('input[type="checkbox"]')
      checkboxes.forEach((cb) => (cb.checked = true))
      deepLog("POPUP", "All checkboxes selected", { count: checkboxes.length })
    })

    selectNoneBtn.addEventListener("click", () => {
      deepLog("POPUP", "Select None button clicked")
      const checkboxes = termsPopup.querySelectorAll('input[type="checkbox"]')
      checkboxes.forEach((cb) => (cb.checked = false))
      deepLog("POPUP", "All checkboxes deselected", { count: checkboxes.length })
    })

    // Close on outside click (but not when dragging)
    document.addEventListener("click", handleOutsideClick)
    deepLog("POPUP", "Outside click listener added")

    // Handle double-click on header to maximize/restore
    header.addEventListener("dblclick", (e) => {
      if (!e.target.closest(".terms-window-controls")) {
        deepLog("POPUP", "Header double-clicked")
        maximizeWindow()
      }
    })

    async function handleSummarize() {
      deepLog("SUMMARIZE", "Starting summarization process")

      if (isProcessing) {
        deepLog("SUMMARIZE", "Already processing, ignoring request")
        return
      }

      const checkboxes = termsPopup.querySelectorAll('input[type="checkbox"]:checked')
      const selectedLinks = Array.from(checkboxes).map((cb) => termsLinks[Number.parseInt(cb.value)])

      deepLog("SUMMARIZE", "Selected links for summarization", {
        selectedCount: selectedLinks.length,
        totalCount: termsLinks.length,
        selectedLinks: selectedLinks.map((l) => ({ text: l.text, url: l.url })),
      })

      if (selectedLinks.length === 0) {
        deepLog("SUMMARIZE", "No links selected, showing alert")
        alert("Please select at least one terms document to summarize.")
        return
      }

      isProcessing = true
      showLoading(true)
      deepLog("SUMMARIZE", "Processing state set, loading shown")

      try {
        // Extract content from selected links
        deepLog("SUMMARIZE", "Starting content extraction for selected links")
        const termsContents = await Promise.all(
          selectedLinks.map(async (link, index) => {
            deepLog("SUMMARIZE", `Extracting content from link ${index + 1}`, { url: link.url })
            const content = await extractTermsContent(link.url)
            const result = { title: link.text, content }
            deepLog("SUMMARIZE", `Content extracted for link ${index + 1}`, {
              title: result.title,
              contentLength: result.content.length,
            })
            return result
          }),
        )

        deepLog("SUMMARIZE", "All content extracted, sending to background script", {
          contentsCount: termsContents.length,
          totalContentLength: termsContents.reduce((sum, tc) => sum + tc.content.length, 0),
        })

        // Send to background script for OpenAI processing
        const response = await chrome.runtime.sendMessage({
          action: "summarizeTerms",
          termsContents: termsContents,
        })

        deepLog("SUMMARIZE", "Response received from background script", {
          success: response.success,
          hasError: !!response.error,
          hasSummary: !!response.summary,
          summaryLength: response.summary?.length || 0,
        })

        if (response.success) {
          showResult(response.summary)
          deepLog("SUMMARIZE", "Summary displayed successfully")
        } else {
          throw new Error(response.error || "Failed to summarize terms")
        }
      } catch (error) {
        deepLog("ERROR", "Summarization failed", error)
        alert("Error summarizing terms: " + error.message)
        closePopup()
      } finally {
        isProcessing = false
        showLoading(false)
        deepLog("SUMMARIZE", "Processing completed, loading hidden")
      }
    }

    function showLoading(show) {
      deepLog("UI", "Toggling loading state", { show })

      const loading = termsPopup.querySelector(".terms-summarizer-loading")
      const footer = termsPopup.querySelector(".terms-summarizer-footer")
      const body = termsPopup.querySelector(".terms-summarizer-body")

      loading.style.display = show ? "block" : "none"
      footer.style.display = show ? "none" : "flex"
      body.style.display = show ? "none" : "block"

      deepLog("UI", "Loading state updated")
    }

    function showResult(summary) {
      deepLog("UI", "Displaying summary result", { summaryLength: summary.length })

      const body = termsPopup.querySelector(".terms-summarizer-body")
      const result = termsPopup.querySelector(".terms-summarizer-result")
      const summaryContent = result.querySelector(".terms-summary-content")
      const footer = termsPopup.querySelector(".terms-summarizer-footer")

      body.style.display = "none"
      footer.style.display = "none"
      result.style.display = "block"

      // Parse markdown and set as HTML safely
      const parsedSummary = parseMarkdown(summary)
      safeSetInnerHTML(summaryContent, parsedSummary)

      // Adjust popup size for result
      termsPopup.style.maxWidth = "400px"
      termsPopup.style.width = "400px"
      saveWindowState()

      deepLog("UI", "Summary result displayed and window resized")
    }

    function handleOutsideClick(event) {
      if (termsPopup && !termsPopup.contains(event.target) && !isDragging) {
        deepLog("POPUP", "Outside click detected, closing popup")
        closePopup()
      }
    }

    deepLog("POPUP", "Popup creation completed successfully")
  }

  // Function to check for terms and show popup
  function checkForTerms() {
    deepLog("CHECK", "Checking for terms on page")

    if (isProcessing || termsPopup) {
      deepLog("CHECK", "Skipping check - already processing or popup exists", {
        isProcessing,
        hasPopup: !!termsPopup,
      })
      return
    }

    const termsLinks = findTermsLinks()

    if (termsLinks.length > 0) {
      deepLog("CHECK", "Terms found, scheduling popup display", {
        linksFound: termsLinks.length,
      })
      // Small delay to ensure page is fully loaded
      setTimeout(() => {
        showTermsPopup(termsLinks)
      }, 1000)
    } else {
      deepLog("CHECK", "No terms links found on page")
    }
  }

  // Initialize debug indicator
  addDebugIndicator()

  // Initialize when page loads
  if (document.readyState === "loading") {
    deepLog("INIT", "Document still loading, adding DOMContentLoaded listener")
    document.addEventListener("DOMContentLoaded", () => {
      deepLog("INIT", "DOMContentLoaded fired, checking for terms")
      checkForTerms()
    })
  } else {
    deepLog("INIT", "Document already loaded, checking for terms immediately")
    checkForTerms()
  }

  // Also check when navigating (for SPAs)
  let lastUrl = location.href
  new MutationObserver(() => {
    const url = location.href
    if (url !== lastUrl) {
      lastUrl = url
      deepLog("NAVIGATION", "URL changed, scheduling terms check", {
        oldUrl: lastUrl,
        newUrl: url,
      })
      setTimeout(checkForTerms, 2000)
    }
  }).observe(document, { subtree: true, childList: true })

  deepLog("INIT", "Content script initialization completed")

  // Function to close the popup
  function closePopup() {
    deepLog("POPUP", "Closing popup")

    if (termsPopup) {
      document.removeEventListener("click", handleOutsideClick)
      document.removeEventListener("keydown", handleKeyDown)
      termsPopup.remove()
      termsPopup = null
      isProcessing = false
      isMinimized = false
      isMaximized = false
      removeHighlights()
      deepLog("POPUP", "Popup closed and cleaned up")
    }
  }
})()
