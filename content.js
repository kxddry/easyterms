// Content script to detect terms of use links and content
;(() => {
  let isProcessing = false
  let termsPopup = null
  let highlightedLinks = []
  let isDragging = false
  const dragOffset = { x: 0, y: 0 }
  const chrome = window.chrome // Declare the chrome variable

  // Terms-related keywords to search for
  const termsKeywords = ["terms", "privacy policy"]

  // Function to safely set innerHTML with TrustedHTML
  function safeSetInnerHTML(element, htmlString) {
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      const policy = window.trustedTypes.createPolicy("terms-summarizer", {
        createHTML: (string) => string,
      })
      element.innerHTML = policy.createHTML(htmlString)
    } else {
      element.innerHTML = htmlString
    }
  }

  // Function to convert basic markdown to HTML
  function parseMarkdown(text) {
    if (!text) return text

    return (
      text
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
          // Check if it's an ordered list (starts with number)
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
    )
  }

  // Function to find terms-related links
  function findTermsLinks() {
    const links = document.querySelectorAll("a[href]")
    const termsLinks = []

    links.forEach((link) => {
      const linkText = link.textContent.toLowerCase().trim()
      const href = link.href.toLowerCase()

      for (const keyword of termsKeywords) {
        if (linkText.includes(keyword) || href.includes(keyword.replace(/\s+/g, "-"))) {
          termsLinks.push({
            element: link,
            text: link.textContent.trim(),
            url: link.href,
            keyword: keyword,
          })
          break
        }
      }
    })

    return termsLinks
  }

  // Function to extract text content from terms page
  async function extractTermsContent(url) {
    try {
      const response = await fetch(url)
      const html = await response.text()
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, "text/html")

      // Remove script and style elements
      const scripts = doc.querySelectorAll("script, style, nav, header, footer")
      scripts.forEach((el) => el.remove())

      // Get main content
      const content =
        doc.querySelector("article")?.innerText.trim() ||
        doc.querySelector("main")?.innerText.trim() ||
        doc.querySelector(".content")?.innerText.trim() ||
        doc.body?.innerText.trim() ||
        ""

      if (!content) {
        throw new Error("Could not extract content from terms page")
      }

      return content
    } catch (error) {
      console.error("Error extracting terms content:", error)
      return ""
    }
  }

  // Function to get optimal popup position
  function getPopupPosition(referenceElement) {
    const rect = referenceElement.getBoundingClientRect()
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft

    const popupWidth = 320
    const popupHeight = 200 // Estimated initial height
    const margin = 10

    let top = rect.bottom + scrollTop + margin
    let left = rect.left + scrollLeft

    // Adjust if popup would go off-screen horizontally
    if (left + popupWidth > window.innerWidth + scrollLeft) {
      left = window.innerWidth + scrollLeft - popupWidth - margin
    }

    // Adjust if popup would go off-screen vertically
    if (top + popupHeight > window.innerHeight + scrollTop) {
      top = rect.top + scrollTop - popupHeight - margin
    }

    // Ensure minimum margins
    left = Math.max(scrollLeft + margin, left)
    top = Math.max(scrollTop + margin, top)

    return { top, left }
  }

  // Function to highlight terms links
  function highlightTermsLinks(termsLinks) {
    highlightedLinks = termsLinks.map((link) => link.element)
    highlightedLinks.forEach((element) => {
      element.classList.add("terms-link-highlighted")
    })
  }

  // Function to remove highlights
  function removeHighlights() {
    highlightedLinks.forEach((element) => {
      element.classList.remove("terms-link-highlighted")
    })
    highlightedLinks = []
  }

  // Function to handle drag functionality
  function initializeDrag(popup, header) {
    header.addEventListener("mousedown", startDrag)

    function startDrag(e) {
      isDragging = true
      const rect = popup.getBoundingClientRect()
      dragOffset.x = e.clientX - rect.left
      dragOffset.y = e.clientY - rect.top

      document.addEventListener("mousemove", drag)
      document.addEventListener("mouseup", stopDrag)
      e.preventDefault()
    }

    function drag(e) {
      if (!isDragging) return

      const newLeft = e.clientX - dragOffset.x
      const newTop = e.clientY - dragOffset.y

      popup.style.left = Math.max(0, Math.min(window.innerWidth - popup.offsetWidth, newLeft)) + "px"
      popup.style.top = Math.max(0, Math.min(window.innerHeight - popup.offsetHeight, newTop)) + "px"
    }

    function stopDrag() {
      isDragging = false
      document.removeEventListener("mousemove", drag)
      document.removeEventListener("mouseup", stopDrag)
    }
  }

  // Function to create and show the terms popup
  function showTermsPopup(termsLinks) {
    if (termsPopup) return

    // Highlight the found links
    highlightTermsLinks(termsLinks)

    // Find the first terms link to position popup near it
    const firstLink = termsLinks[0].element
    const position = getPopupPosition(firstLink)

    termsPopup = document.createElement("div")
    termsPopup.className = "terms-summarizer-popup"
    termsPopup.style.top = position.top + "px"
    termsPopup.style.left = position.left + "px"

    const popupHTML = `
      <div class="terms-summarizer-header">
        <h3>Terms Found</h3>
        <button class="terms-summarizer-close">&times;</button>
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
        <p style="font-size: 11px; color: #888;">Summarize selected terms?</p>
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

    safeSetInnerHTML(termsPopup, popupHTML)
    document.body.appendChild(termsPopup)

    // Initialize drag functionality
    const header = termsPopup.querySelector(".terms-summarizer-header")
    initializeDrag(termsPopup, header)

    // Event listeners
    const closeBtn = termsPopup.querySelector(".terms-summarizer-close")
    const cancelBtn = termsPopup.querySelector(".terms-summarizer-cancel")
    const summarizeBtn = termsPopup.querySelector(".terms-summarizer-summarize")
    const selectAllBtn = termsPopup.querySelector("#select-all")
    const selectNoneBtn = termsPopup.querySelector("#select-none")

    closeBtn.addEventListener("click", closePopup)
    cancelBtn.addEventListener("click", closePopup)
    summarizeBtn.addEventListener("click", handleSummarize)

    // All/None button functionality
    selectAllBtn.addEventListener("click", () => {
      const checkboxes = termsPopup.querySelectorAll('input[type="checkbox"]')
      checkboxes.forEach((cb) => (cb.checked = true))
    })

    selectNoneBtn.addEventListener("click", () => {
      const checkboxes = termsPopup.querySelectorAll('input[type="checkbox"]')
      checkboxes.forEach((cb) => (cb.checked = false))
    })

    // Close on outside click (but not when dragging)
    document.addEventListener("click", handleOutsideClick)

    async function handleSummarize() {
      if (isProcessing) return

      const checkboxes = termsPopup.querySelectorAll('input[type="checkbox"]:checked')
      const selectedLinks = Array.from(checkboxes).map((cb) => termsLinks[Number.parseInt(cb.value)])

      if (selectedLinks.length === 0) {
        alert("Please select at least one terms document to summarize.")
        return
      }

      isProcessing = true
      showLoading(true)

      try {
        // Extract content from selected links
        const termsContents = await Promise.all(
          selectedLinks.map(async (link) => {
            const content = await extractTermsContent(link.url)
            return { title: link.text, content }
          }),
        )

        // Send to background script for OpenAI processing
        const response = await chrome.runtime.sendMessage({
          action: "summarizeTerms",
          termsContents: termsContents,
        })

        if (response.success) {
          showResult(response.summary)
        } else {
          throw new Error(response.error || "Failed to summarize terms")
        }
      } catch (error) {
        console.error("Error summarizing terms:", error)
        alert("Error summarizing terms: " + error.message)
        closePopup()
      } finally {
        isProcessing = false
        showLoading(false)
      }
    }

    function showLoading(show) {
      const loading = termsPopup.querySelector(".terms-summarizer-loading")
      const footer = termsPopup.querySelector(".terms-summarizer-footer")
      const body = termsPopup.querySelector(".terms-summarizer-body")

      loading.style.display = show ? "block" : "none"
      footer.style.display = show ? "none" : "flex"
      body.style.display = show ? "none" : "block"
    }

    function showResult(summary) {
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
    }

    function handleOutsideClick(event) {
      if (termsPopup && !termsPopup.contains(event.target) && !isDragging) {
        closePopup()
      }
    }

    function closePopup() {
      if (termsPopup) {
        document.removeEventListener("click", handleOutsideClick)
        termsPopup.remove()
        termsPopup = null
        isProcessing = false
        removeHighlights()
      }
    }
  }

  // Function to check for terms and show popup
  function checkForTerms() {
    if (isProcessing || termsPopup) return

    const termsLinks = findTermsLinks()

    if (termsLinks.length > 0) {
      // Small delay to ensure page is fully loaded
      setTimeout(() => {
        showTermsPopup(termsLinks)
      }, 1000)
    }
  }

  // Initialize when page loads
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkForTerms)
  } else {
    checkForTerms()
  }

  // Also check when navigating (for SPAs)
  let lastUrl = location.href
  new MutationObserver(() => {
    const url = location.href
    if (url !== lastUrl) {
      lastUrl = url
      setTimeout(checkForTerms, 2000)
    }
  }).observe(document, { subtree: true, childList: true })
})()
