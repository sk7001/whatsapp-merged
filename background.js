// Global variables to track sending state
let isProcessRunning = false;
let sendingPaused = false;
let sendingStopped = false;
let numbers = [];
let currentMessage = '';
let currentIndex = 0;
let successCount = 0;
let failedCount = 0;
let tabId = null;

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('WhatsApp Tools extension installed');
    chrome.storage.local.set({ messageHistory: [] }, () => {
      console.log('Message history initialized');
    });
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startSending') {
    // Start the sending process
    numbers = request.numbers;
    currentMessage = request.message;
    currentIndex = 0;
    successCount = 0;
    failedCount = 0;
    sendingPaused = false;
    sendingStopped = false;
    isProcessRunning = true;
    
    startSendingProcess();
    sendResponse({status: 'started'});
    return true;
  }
  
  if (request.action === 'pauseSending') {
    sendingPaused = request.pause;
    sendResponse({status: sendingPaused ? 'paused' : 'resumed'});
    return true;
  }
  
  if (request.action === 'stopSending') {
    sendingStopped = true;
    isProcessRunning = false;
    sendResponse({status: 'stopped'});
    return true;
  }
  
  if (request.action === 'getStatus') {
    sendResponse({
      isRunning: isProcessRunning,
      currentIndex: currentIndex,
      totalCount: numbers.length,
      successCount: successCount,
      failedCount: failedCount,
      isPaused: sendingPaused
    });
    return true;
  }
  
  return false;
});

// Main sending process
async function startSendingProcess() {
  if (!isProcessRunning || currentIndex >= numbers.length || sendingStopped) {
    isProcessRunning = false;
    chrome.runtime.sendMessage({
      action: 'processComplete',
      successCount: successCount,
      failedCount: failedCount
    });
    return;
  }
  
  // If paused, wait and check again
  if (sendingPaused) {
    setTimeout(startSendingProcess, 1000);
    return;
  }
  
  const number = numbers[currentIndex];
  
  // Log to popup if it's open
  chrome.runtime.sendMessage({
    action: 'log',
    message: `⏳ Opening chat for: ${number}...`
  });
  
  // Get or create a tab for WhatsApp
  if (!tabId) {
    const tabs = await chrome.tabs.query({url: 'https://web.whatsapp.com/*'});
    if (tabs.length > 0) {
      tabId = tabs[0].id;
    } else {
      const newTab = await chrome.tabs.create({url: 'https://web.whatsapp.com/'});
      tabId = newTab.id;
      // Wait for WhatsApp to load
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // Navigate to the chat
  const whatsappURL = `https://web.whatsapp.com/send?phone=${number}&text=${currentMessage}`;
  await chrome.tabs.update(tabId, {url: whatsappURL});
  
  // Wait for WhatsApp to load
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  try {
    // Execute the send message script
    const result = await chrome.scripting.executeScript({
      target: {tabId: tabId},
      func: sendWhatsAppMessage,
      args: [decodeURIComponent(currentMessage), number]
    });
    
    const success = result[0]?.result;
    
    if (success === false) {
      // Message failed to send
      failedCount++;
      chrome.runtime.sendMessage({
        action: 'log',
        message: `❌ Failed to send message to ${number}`
      });
      chrome.runtime.sendMessage({
        action: 'failedNumber',
        number: number
      });
    } else {
      // Message sent successfully
      successCount++;
      chrome.runtime.sendMessage({
        action: 'log',
        message: `✅ Message sent to ${number}`
      });
      
      // Save to IndexedDB via popup
      chrome.runtime.sendMessage({
        action: 'saveHistory',
        number: number,
        message: decodeURIComponent(currentMessage)
      });
    }
    
    // Update progress
    chrome.runtime.sendMessage({
      action: 'updateProgress',
      currentIndex: currentIndex + 1,
      totalCount: numbers.length,
      successCount: successCount,
      failedCount: failedCount
    });
    
    // Move to next number
    currentIndex++;
    
    // Continue with next number after delay
    setTimeout(startSendingProcess, 5000);
  } catch (error) {
    chrome.runtime.sendMessage({
      action: 'log',
      message: `❌ Error: ${error.message}`
    });
    
    // Try to continue with next number
    currentIndex++;
    setTimeout(startSendingProcess, 5000);
  }
}

// Content script function for sending messages
function sendWhatsAppMessage(message, phoneNumber) {
  // Reset the flag for each new message attempt
  window.scriptAlreadyExecuted = false;
  
  if (window.scriptAlreadyExecuted) return false;
  window.scriptAlreadyExecuted = true;

  function sendLogToPopup(text) {
    chrome.runtime.sendMessage({ action: 'log', message: text });
  }

  function reportFailedNumber(number) {
    chrome.runtime.sendMessage({ action: 'failedNumber', number: number });
  }

  sendLogToPopup("⏳ Waiting for WhatsApp chat to load...");

  return new Promise(async (resolve) => {
    let retries = 10;
    let messageInput;

    // Check for invalid number page
    const invalidNumberCheck = () => {
      return (
        document.querySelector('div[data-animate-modal-body="true"]') ||
        document.querySelector('div._3J6wB') ||
        document.body.textContent.includes('Phone number shared via url is invalid')
      );
    };

    // Wait for either the chat to load or an error to appear
    while (retries > 0) {
      messageInput = document.querySelector(
        'div[contenteditable="true"][aria-label="Type a message"]'
      );

      // Check for invalid number error
      if (invalidNumberCheck()) {
        sendLogToPopup(`❌ Invalid phone number: ${phoneNumber}`);
        reportFailedNumber(phoneNumber);
        resolve(false);
        return;
      }

      if (messageInput) break;

      // Wait for a short period before retrying
      await new Promise((resolve) => setTimeout(resolve, 400));
      retries--;
    }

    if (!messageInput) {
      sendLogToPopup(`❌ Message input box not found for: ${phoneNumber}`);
      reportFailedNumber(phoneNumber);
      resolve(false);
      return;
    }

    sendLogToPopup('✅ Chat loaded. Typing message...');
    messageInput.innerHTML = '';
    messageInput.focus();
    document.execCommand('insertText', false, message);
    await new Promise((resolve) => setTimeout(resolve, 800));

    sendLogToPopup('✅ Message typed. Sending...');

    messageInput.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    sendLogToPopup(`✅ Message sent to ${phoneNumber}`);
    resolve(true);
  });
}