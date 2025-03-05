// Toggle functionality
document.getElementById('extractorToggle').addEventListener('click', () => {
  document.getElementById('extractorToggle').classList.add('active');
  document.getElementById('senderToggle').classList.remove('active');
  document.getElementById('extractorTool').classList.add('active');
  document.getElementById('senderTool').classList.remove('active');
});

document.getElementById('senderToggle').addEventListener('click', () => {
  document.getElementById('senderToggle').classList.add('active');
  document.getElementById('extractorToggle').classList.remove('active');
  document.getElementById('senderTool').classList.add('active');
  document.getElementById('extractorTool').classList.remove('active');
});

// Log tabs functionality
document.getElementById('logTab').addEventListener('click', () => {
  document.getElementById('logTab').classList.add('active');
  document.getElementById('failedTab').classList.remove('active');
  document.getElementById('status').classList.add('active');
  document.getElementById('failedNumbers').classList.remove('active');
});

document.getElementById('failedTab').addEventListener('click', () => {
  document.getElementById('failedTab').classList.add('active');
  document.getElementById('logTab').classList.remove('active');
  document.getElementById('failedNumbers').classList.add('active');
  document.getElementById('status').classList.remove('active');
});

// Transfer button functionality
document.getElementById('transferToSender').addEventListener('click', () => {
  const extractedContent = document.getElementById('content').innerText;
  if (extractedContent && extractedContent !== "Click \"Extract\" to get numbers." && 
      extractedContent !== "No numbers found!" && extractedContent !== "Div not found on this page.") {
    document.getElementById('numbers').value = extractedContent;
    // Switch to sender tab
    document.getElementById('senderToggle').click();
    // Update number count
    updateNumberCount();
  } else {
    alert("No numbers to transfer!");
  }
});

// Number Extractor functionality
document.getElementById("extract").addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractNumbers
  }).then((results) => {
    let extractedText = results[0].result || "No numbers found!";
    document.getElementById("content").innerText = extractedText;
  });
});

document.getElementById("copy").addEventListener("click", () => {
  let content = document.getElementById("content").innerText;
  
  if (content.trim() && content !== "Click \"Extract\" to get numbers.") {
    navigator.clipboard.writeText(content).then(() => {
      alert("Copied to clipboard!");
    }).catch(err => {
      console.error("Failed to copy: ", err);
    });
  } else {
    alert("No numbers to copy!");
  }
});

// Bulk Sender functionality
function updateNumberCount() {
  const numbers = document.getElementById('numbers').value
    .split(/[\n,]+/)
    .map(num => num.trim().replace(/[^0-9+]/g, ''))
    .filter(num => num.length > 0);
  document.getElementById('numberCount').innerText = `Total Numbers: ${numbers.length}`;
}

document.getElementById('numbers').addEventListener('input', updateNumberCount);

const logContainer = document.getElementById('status');
const failedNumbersContainer = document.getElementById('failedNumbers');
const timeRemainingEl = document.getElementById('timeRemaining');

function logMessage(text) {
  let logEntry = document.createElement('div');
  logEntry.textContent = text;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// Function to add a failed number only if it hasn't already been added
function addFailedNumber(number) {
  const existingEntries = Array.from(failedNumbersContainer.children).map(
    (child) => child.textContent.trim()
  );

  if (!existingEntries.includes(number)) {
    if (failedNumbersContainer.textContent === 'No failed numbers yet.') {
      failedNumbersContainer.textContent = '';
    }

    let failedEntry = document.createElement('div');
    failedEntry.textContent = number;
    failedNumbersContainer.appendChild(failedEntry);
    failedNumbersContainer.scrollTop = failedNumbersContainer.scrollHeight;

    // Update the tab to show there are failed numbers (visual indicator)
    document.getElementById('failedTab').style.color = '#ff6b6b';
  }
}

// Listener for messages from content scripts
chrome.runtime.onMessage.addListener((request) => {
  if (request.log) {
    logMessage(request.log);
  }
  if (request.failedNumber) {
    addFailedNumber(request.failedNumber);
  }
});

// Main function for sending messages
document.getElementById('start').addEventListener('click', async () => {
  const numbers = document.getElementById('numbers').value
    .split(/[\n,]+/)
    .map((num) => num.trim().replace(/[^0-9+]/g, ''))
    .filter((num) => num.length > 0);
  const message = encodeURIComponent(
    document.getElementById('message').value.trim()
  );

  if (numbers.length === 0 || !message) {
    alert('❌ Please enter at least one phone number and a message.');
    return;
  }

  // Reset failed numbers container
  failedNumbersContainer.textContent = 'No failed numbers yet.';
  document.getElementById('failedTab').style.color = 'white';

  // Clear log container
  logContainer.textContent = '';

  let sentCount = 0;
  const totalCount = numbers.length;
  const estimatedTimePerMessage = 8;
  let totalRemainingTime = totalCount * estimatedTimePerMessage;

  function updateRemainingTime() {
    const hours = String(Math.floor(totalRemainingTime / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalRemainingTime % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalRemainingTime % 60).padStart(2, '0');
    timeRemainingEl.textContent = `${hours}:${minutes}:${seconds}`;
  }

  updateRemainingTime();
  document.getElementById('progress').firstElementChild.innerText = `Sent: ${sentCount} | Remaining: ${totalCount - sentCount}`;

  const timerInterval = setInterval(() => {
    if (totalRemainingTime > 0) {
      totalRemainingTime--;
      updateRemainingTime();
    } else {
      clearInterval(timerInterval);
    }
  }, 1000);

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (tabs.length === 0) {
      logMessage('❌ No active tab found!');
      return;
    }

    let tabId = tabs[0].id;

    for (let i = 0; i < numbers.length; i++) {
      const number = numbers[i];
      let whatsappURL = `https://web.whatsapp.com/send?phone=${number}&text=${message}`;

      logMessage(`⏳ Opening chat for: ${number}...`);
      chrome.tabs.update(tabId, { url: whatsappURL });

      await new Promise((resolve) => setTimeout(resolve, 8000));

      const result = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        args: [decodeURIComponent(message), number],
        func: sendWhatsAppMessage,
      });

      const success = result[0]?.result;

      if (!success) {
        // Message failed to send
        addFailedNumber(number);
      }

      sentCount++;
      document.getElementById('progress').firstElementChild.innerText = `Sent: ${sentCount} | Remaining: ${totalCount - sentCount}`;
      updateRemainingTime();

      if (i < numbers.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    clearInterval(timerInterval);
    timeRemainingEl.textContent = '00:00:00';

    if (failedNumbersContainer.children.length > 0 && failedNumbersContainer.textContent !== 'No failed numbers yet.') {
      logMessage(`🎉 ✅ Process complete! ${totalCount - failedNumbersContainer.children.length} sent, ${failedNumbersContainer.children.length} failed.`);
      // Highlight the failed tab
      document.getElementById('failedTab').style.color = '#ff6b6b';
    } else {
      logMessage('🎉 ✅ All messages sent successfully!');
    }
  });
});

// Content script functions
function sendWhatsAppMessage(message, phoneNumber) {
  if (window.scriptAlreadyExecuted) return false;
  window.scriptAlreadyExecuted = true;

  function sendLogToPopup(text) {
    chrome.runtime.sendMessage({ log: text });
  }

  function reportFailedNumber(number) {
    chrome.runtime.sendMessage({ failedNumber: number });
  }

  sendLogToPopup('⏳ Waiting for WhatsApp chat to load...');

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
      await new Promise((r) => setTimeout(r, 400));
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
    await new Promise((r) => setTimeout(r, 800));

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

    await new Promise((r) => setTimeout(r, 1000));

    sendLogToPopup(`✅ Message sent to ${phoneNumber}`);
    resolve(true);
  });
}
