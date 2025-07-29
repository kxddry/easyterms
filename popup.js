// Popup script for extension settings
document.addEventListener("DOMContentLoaded", async () => {
  const apiKeyInput = document.getElementById("apiKey")
  const saveBtn = document.getElementById("saveBtn")
  const testBtn = document.getElementById("testBtn")
  const statusDiv = document.getElementById("status")
  const connectionStatus = document.getElementById("connectionStatus")
  const modelSelect = document.getElementById("modelSelect")
  const selectedModelSpan = document.getElementById("selectedModel")

  // Declare chrome variable
  const chrome = window.chrome

  // Load saved settings
  const savedData = await chrome.storage.sync.get(["openaiApiKey", "selectedModel"])
  if (savedData.openaiApiKey) {
    apiKeyInput.value = savedData.openaiApiKey
    testBtn.disabled = false
    connectionStatus.textContent = "Configured"
  }

  // Load saved model or default to gpt-4.1-nano
  const selectedModel = savedData.selectedModel || "gpt-4.1-nano"
  modelSelect.value = selectedModel
  updateSelectedModelDisplay(selectedModel)

  // Add event listener for model selection change
  modelSelect.addEventListener("change", () => {
    updateSelectedModelDisplay(modelSelect.value)
  })

  // Save API key and model
  saveBtn.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim()
    const model = modelSelect.value

    if (!apiKey) {
      showStatus("Please enter an API key", "error")
      return
    }

    if (!apiKey.startsWith("sk-")) {
      showStatus("Invalid API key format", "error")
      return
    }

    try {
      await chrome.storage.sync.set({
        openaiApiKey: apiKey,
        selectedModel: model,
      })
      showStatus("Settings saved successfully!", "success")
      testBtn.disabled = false
      connectionStatus.textContent = "Configured"
      updateSelectedModelDisplay(model)
    } catch (error) {
      showStatus("Error saving settings: " + error.message, "error")
    }
  })

  // Test API connection
  testBtn.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim()

    if (!apiKey) {
      showStatus("Please enter an API key first", "error")
      return
    }

    testBtn.disabled = true
    testBtn.textContent = "Testing..."

    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      })

      if (response.ok) {
        showStatus("Connection successful!", "success")
        connectionStatus.textContent = "Connected"
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || "Connection failed")
      }
    } catch (error) {
      showStatus("Connection failed: " + error.message, "error")
      connectionStatus.textContent = "Error"
    } finally {
      testBtn.disabled = false
      testBtn.textContent = "Test Connection"
    }
  })

  function showStatus(message, type) {
    statusDiv.textContent = message
    statusDiv.className = `status ${type}`
    statusDiv.style.display = "block"

    setTimeout(() => {
      statusDiv.style.display = "none"
    }, 3000)
  }

  function updateSelectedModelDisplay(model) {
    const modelNames = {
      "gpt-4.1-nano": "GPT-4.1 Nano",
      "gpt-4.1-mini": "GPT-4.1 Mini",
      "gpt-4o-mini": "GPT-4o Mini",
      "gpt-4o": "GPT-4o",
      "gpt-4.1": "GPT-4.1",
    }
    selectedModelSpan.textContent = modelNames[model] || model
  }
})
