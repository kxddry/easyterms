// Content script to detect terms of use links and content
;(() => {
  let isProcessing = false
  let termsModal = null
  const chrome = window.chrome // Declare the chrome variable

  // Terms-related keywords to search for
  const termsKeywords = [
    "terms",
    "privacy policy",
  ]

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
      const out = doc.querySelector("article").innerText.trim() || doc.querySelector('main').innerText.trim() || doc.querySelector('.content').innerText.trim() || doc.body
      if (out == '') {
        throw("error fetching terms, empty output")
      }
    } catch (error) {
      console.error("Error extracting terms content:", error)
      return ""
    }
  }

  // Function to create and show the terms modal
  function showTermsModal(termsLinks) {
    if (termsModal) return
    console.log(termsLinks)

    termsModal = document.createElement("div")
    termsModal.className = "terms-summarizer-modal"
    termsModal.innerHTML = `
      <div class="terms-summarizer-content">
        <div class="terms-summarizer-header">
          <h3>Terms of Use Detected</h3>
          <button class="terms-summarizer-close">&times;</button>
        </div>
        <div class="terms-summarizer-body">
          <p>We found ${termsLinks.length} terms-related document(s) on this page:</p>
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
          <p>Would you like to summarize the selected terms?</p>
        </div>
        <div class="terms-summarizer-footer">
          <button class="terms-summarizer-btn terms-summarizer-cancel">Cancel</button>
          <button class="terms-summarizer-btn terms-summarizer-summarize">Summarize</button>
        </div>
        <div class="terms-summarizer-loading" style="display: none;">
          <p>Analyzing terms... This may take a moment.</p>
          <div class="terms-summarizer-spinner"></div>
        </div>
        <div class="terms-summarizer-result" style="display: none;">
          <h4>Summary:</h4>
          <div class="terms-summary-content"></div>
        </div>
      </div>
    `

    document.body.appendChild(termsModal)

    // Event listeners
    const closeBtn = termsModal.querySelector(".terms-summarizer-close")
    const cancelBtn = termsModal.querySelector(".terms-summarizer-cancel")
    const summarizeBtn = termsModal.querySelector(".terms-summarizer-summarize")

    closeBtn.addEventListener("click", closeModal)
    cancelBtn.addEventListener("click", closeModal)
    summarizeBtn.addEventListener("click", handleSummarize)

    // Close on outside click
    termsModal.addEventListener("click", (e) => {
      if (e.target === termsModal) closeModal()
    })

    async function handleSummarize() {
      if (isProcessing) return

      const checkboxes = termsModal.querySelectorAll('input[type="checkbox"]:checked')
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
        closeModal()
      } finally {
        isProcessing = false
        showLoading(false)
      }
    }

    function showLoading(show) {
      const loading = termsModal.querySelector(".terms-summarizer-loading")
      const footer = termsModal.querySelector(".terms-summarizer-footer")
      loading.style.display = show ? "block" : "none"
      footer.style.display = show ? "none" : "flex"
    }

    function showResult(summary) {
      const body = termsModal.querySelector(".terms-summarizer-body")
      const result = termsModal.querySelector(".terms-summarizer-result")
      const summaryContent = result.querySelector(".terms-summary-content")

      body.style.display = "none"
      result.style.display = "block"

      // Parse markdown and set as HTML
      const parsedSummary = parseMarkdown(summary)
      summaryContent.innerHTML = parsedSummary
    }

    function closeModal() {
      if (termsModal) {
        termsModal.remove()
        termsModal = null
        isProcessing = false
      }
    }
  }

  // Function to check for terms and show modal
  function checkForTerms() {
    if (isProcessing || termsModal) return

    const termsLinks = findTermsLinks()

    if (termsLinks.length > 0) {
      // Small delay to ensure page is fully loaded
      setTimeout(() => {
        showTermsModal(termsLinks)
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
