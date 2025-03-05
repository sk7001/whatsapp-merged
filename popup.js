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
  const timeRemainingEl = document.getElementById('timeRemaining');
  
  function logMessage(text) {
    let logEntry = document.createElement('div');
    logEntry.textContent = text;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  
  chrome.runtime.onMessage.addListener((request) => {
    if (request.log) {
      logMessage(request.log);
    }
  });
  
  document.getElementById('start').addEventListener('click', async () => {
    const numbers = document.getElementById('numbers').value
      .split(/[\n,]+/)
      .map(num => num.trim().replace(/[^0-9+]/g, ''))
      .filter(num => num.length > 0);
    const message = encodeURIComponent(document.getElementById('message').value.trim());
  
    if (numbers.length === 0 || !message) {
      alert("❌ Please enter at least one phone number and a message.");
      return;
    }
  
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
        logMessage("❌ No active tab found!");
        return;
      }
  
      let tabId = tabs[0].id;
  
      for (let i = 0; i < numbers.length; i++) {
        const number = numbers[i];
        let whatsappURL = `https://web.whatsapp.com/send?phone=${number}&text=${message}`;
  
        logMessage(`⏳ Opening chat for: ${number}...`);
        chrome.tabs.update(tabId, { url: whatsappURL });
  
        await new Promise(resolve => setTimeout(resolve, 8000));
  
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          args: [decodeURIComponent(message)],
          func: sendWhatsAppMessage
        });
  
        sentCount++;
        document.getElementById('progress').firstElementChild.innerText = `Sent: ${sentCount} | Remaining: ${totalCount - sentCount}`;
        updateRemainingTime();
  
        if (i < numbers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
  
      clearInterval(timerInterval);
      timeRemainingEl.textContent = "00:00:00";
      logMessage("🎉 ✅ All messages sent!");
    });
  });
  
  // Content script functions
  function extractNumbers() {
    let div = document.querySelector(".x78zum5.x1cy8zhl.xisnujt.x1nxh6w3.xcgms0a.x16cd2qt");
  
    if (div) {
      let extractedContent = div.innerText;
      
      // Extract phone numbers with optional "+" at the start
      let phoneNumbers = extractedContent.match(/\+?\d{1,3} \d{5} \d{5}/g);
      
      return phoneNumbers ? phoneNumbers.join("\n") : "No numbers found!";
    } else {
      return "Div not found on this page.";
    }
  }
  
  function sendWhatsAppMessage(message) {
    if (window.scriptAlreadyExecuted) return;
    window.scriptAlreadyExecuted = true;
  
    function sendLogToPopup(text) {
      chrome.runtime.sendMessage({ log: text });
    }
  
    sendLogToPopup("⏳ Waiting for WhatsApp chat to load...");
  
    return new Promise(async (resolve) => {
      let retries = 10;
      let messageInput;
      while (retries > 0) {
        messageInput = document.querySelector('div[contenteditable="true"][aria-label="Type a message"]');
        if (messageInput) break;
        await new Promise(r => setTimeout(r, 400));
        retries--;
      }
  
      if (!messageInput) {
        sendLogToPopup("❌ Message input box not found!");
        resolve();
        return;
      }
  
      sendLogToPopup("✅ Chat loaded. Typing message...");
      messageInput.innerHTML = "";
      messageInput.focus();
      document.execCommand("insertText", false, message);
      await new Promise(r => setTimeout(r, 800));
  
      sendLogToPopup("✅ Message typed. Sending...");
  
      messageInput.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
      }));
  
      await new Promise(r => setTimeout(r, 1000));
  
      sendLogToPopup(`✅ Message sent to ${window.location.href}`);
      resolve();
    });
  }
  