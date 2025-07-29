chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "summarizeTerms") {
    handleSummarizeTerms(request.termsContents)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message }))
    return true // Keep message channel open for async response
  }
})

async function handleSummarizeTerms(termsContents) {
  try {
    // Get API key and selected model from storage
    const result = await chrome.storage.sync.get(["openaiApiKey", "selectedModel"])
    const apiKey = result.openaiApiKey
    const selectedModel = result.selectedModel || "gpt-4.1-nano"

    if (!apiKey) {
      throw new Error("OpenAI API key not configured. Please set it in the extension settings.")
    }

    // Prepare the content for summarization
    const combinedContent = termsContents.map((item) => `## ${item.title}\n\n${item.content}`).join("\n\n---\n\n")

    const maxLength = selectedModel.includes("gpt-4.1") ? 1037576 : selectedModel.includes("gpt-4o") ? 128000 : 64000
    const contentToSummarize =
      combinedContent.length > maxLength
        ? combinedContent.substring(0, maxLength) + "\n\n[Content truncated due to length...]"
        : combinedContent


    // Make API call to OpenAI with selected model
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`)
    }

    const data = await response.json()
    const summary = data.choices[0]?.message?.content

    if (!summary) {
      throw new Error("No summary received from OpenAI")
    }

    return { success: true, summary }
  } catch (error) {
    console.error("Error in handleSummarizeTerms:", error)
    return { success: false, error: error.message }
  }
}
