// Background script with deep logging
const LOG_PREFIX = "[TERMS-BACKGROUND]"
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

deepLog("INIT", "Background script starting")

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  deepLog("MESSAGE", "Message received", {
    action: request.action,
    sender: {
      tab: sender.tab?.id,
      url: sender.tab?.url,
      frameId: sender.frameId,
    },
    requestData: {
      hasTermsContents: !!request.termsContents,
      termsContentsCount: request.termsContents?.length || 0,
      hasUrl: !!request.url,
    },
  })

  if (request.action === "fetchContent") {
    deepLog("FETCH", "Processing content fetch request", { url: request.url })

    fetchTermsContent(request.url)
      .then((result) => {
        deepLog("FETCH", "Content fetch completed", {
          success: result.success,
          hasError: !!result.error,
          hasHtml: !!result.html,
          htmlLength: result.html?.length || 0,
        })
        sendResponse(result)
      })
      .catch((error) => {
        deepLog("ERROR", "Content fetch failed in promise chain", error)
        sendResponse({
          success: false,
          error: error.message,
          technicalError: error.stack,
          url: request.url,
        })
      })
    return true // Keep message channel open for async response
  }

  if (request.action === "summarizeTerms") {
    deepLog("SUMMARIZE", "Processing summarize request")

    handleSummarizeTerms(request.termsContents)
      .then((result) => {
        deepLog("SUMMARIZE", "Summarization completed", {
          success: result.success,
          hasError: !!result.error,
          hasSummary: !!result.summary,
          summaryLength: result.summary?.length || 0,
        })
        sendResponse(result)
      })
      .catch((error) => {
        deepLog("ERROR", "Summarization failed in promise chain", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // Keep message channel open for async response
  }

  deepLog("MESSAGE", "Unknown action received", { action: request.action })
})

async function handleSummarizeTerms(termsContents) {
  deepLog("PROCESS", "Starting terms summarization", {
    contentsCount: termsContents?.length || 0,
    contents:
      termsContents?.map((tc) => ({
        title: tc.title,
        contentLength: tc.content?.length || 0,
      })) || [],
  })

  try {
    // Get API key and selected model from storage
    deepLog("STORAGE", "Retrieving API key and model from storage")
    const result = await chrome.storage.sync.get(["openaiApiKey", "selectedModel"])
    const apiKey = result.openaiApiKey
    const selectedModel = result.selectedModel || "gpt-4.1-nano"

    deepLog("STORAGE", "Storage data retrieved", {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      selectedModel,
      apiKeyPrefix: apiKey?.substring(0, 7) || "none",
    })

    if (!apiKey) {
      const error = "OpenAI API key not configured. Please set it in the extension settings."
      deepLog("ERROR", error)
      throw new Error(error)
    }

    // Prepare the content for summarization
    deepLog("CONTENT", "Preparing content for summarization")
    const combinedContent = termsContents.map((item) => `## ${item.title}\n\n${item.content}`).join("\n\n---\n\n")

    deepLog("CONTENT", "Content combined", {
      combinedLength: combinedContent.length,
      itemCount: termsContents.length,
    })

    const maxLength = selectedModel.includes("gpt-4.1") ? 1037576 : selectedModel.includes("gpt-4o") ? 128000 : 64000
    const contentToSummarize =
      combinedContent.length > maxLength
        ? combinedContent.substring(0, maxLength) + "\n\n[Content truncated due to length...]"
        : combinedContent

    deepLog("CONTENT", "Content prepared for API", {
      originalLength: combinedContent.length,
      finalLength: contentToSummarize.length,
      maxLength,
      wasTruncated: combinedContent.length > maxLength,
    })

    // Make API call to OpenAI with selected model
    deepLog("API", "Making OpenAI API request", {
      model: selectedModel,
      contentLength: contentToSummarize.length,
      endpoint: "https://api.openai.com/v1/chat/completions",
    })

    const requestBody = {
      model: selectedModel,
      messages: [
        {
          role: "system",
          content:
            "You are a legal document summarizer. Provide a clear, concise summary of terms of use/service documents. Focus on the most important points that users should know, including key rights, obligations, limitations, and any concerning clauses. Use bullet points and clear language.",
        },
        {
          role: "user",
          content: `Please summarize the following terms of use/service document(s):\n\n${contentToSummarize}`,
        },
      ],
      temperature: 0.3,
    }

    deepLog("API", "Request body prepared", {
      model: requestBody.model,
      messagesCount: requestBody.messages.length,
      systemPromptLength: requestBody.messages[0].content.length,
      userPromptLength: requestBody.messages[1].content.length,
      temperature: requestBody.temperature,
    })

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    })

    deepLog("API", "OpenAI API response received", {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: {
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      deepLog("ERROR", "OpenAI API error response", {
        status: response.status,
        statusText: response.statusText,
        errorData,
      })
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`)
    }

    const data = await response.json()
    deepLog("API", "OpenAI API response parsed", {
      hasChoices: !!data.choices,
      choicesCount: data.choices?.length || 0,
      hasUsage: !!data.usage,
      usage: data.usage,
      model: data.model,
    })

    const summary = data.choices[0]?.message?.content

    if (!summary) {
      deepLog("ERROR", "No summary received from OpenAI", { data })
      throw new Error("No summary received from OpenAI")
    }

    deepLog("SUCCESS", "Summary generated successfully", {
      summaryLength: summary.length,
      summaryPreview: summary.substring(0, 200) + "...",
    })

    return { success: true, summary }
  } catch (error) {
    deepLog("ERROR", "Error in handleSummarizeTerms", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    })
    return { success: false, error: error.message }
  }
}

async function fetchTermsContent(url) {
  deepLog("FETCH", "Starting content fetch in background", { url })

  try {
    deepLog("FETCH", "Attempting to fetch URL from background script")
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    })

    if (!response.ok) {
      const errorMessage = `HTTP ${response.status}: ${response.statusText}`
      deepLog("ERROR", "Fetch failed with HTTP error", {
        status: response.status,
        statusText: response.statusText,
        url,
      })
      throw new Error(errorMessage)
    }

    deepLog("FETCH", "Fetch successful", {
      status: response.status,
      contentType: response.headers.get("content-type"),
      contentLength: response.headers.get("content-length"),
    })

    const html = await response.text()
    deepLog("FETCH", "HTML received", { htmlLength: html.length })

    if (!html || html.trim().length === 0) {
      throw new Error("Received empty response from server")
    }

    deepLog("FETCH", "Content fetch completed successfully", {
      htmlLength: html.length,
      htmlPreview: html.substring(0, 200) + "...",
    })

    return { success: true, html }
  } catch (error) {
    deepLog("ERROR", "Content fetch failed in background", {
      url,
      error: error.message,
      errorType: error.name,
      stack: error.stack,
    })

    // Provide specific error messages based on error type
    let userFriendlyMessage = ""

    if (error.message.includes("403") || error.message.includes("Forbidden")) {
      userFriendlyMessage = `Access denied to ${new URL(url).hostname}. The site is blocking automated access.`
    } else if (error.message.includes("404") || error.message.includes("Not Found")) {
      userFriendlyMessage = `The terms page was not found at ${url}. The link may be broken or outdated.`
    } else if (error.message.includes("Failed to fetch") || error.message.includes("ERR_FAILED")) {
      userFriendlyMessage = `Failed to load content from ${new URL(url).hostname}. The site may be down or blocking requests.`
    } else if (error.message.includes("empty response")) {
      userFriendlyMessage = `The terms page at ${new URL(url).hostname} returned empty content.`
    } else {
      userFriendlyMessage = `Error loading content from ${new URL(url).hostname}: ${error.message}`
    }

    return {
      success: false,
      error: userFriendlyMessage,
      technicalError: error.message,
      url: url,
    }
  }
}

deepLog("INIT", "Background script initialization completed")
