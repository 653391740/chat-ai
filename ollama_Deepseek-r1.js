// ===================== 选择器与全局变量 =====================
// 选择器和全局常量、状态配置
const content = document.querySelector(".content");
const input = document.querySelector(".search-input");
const send = document.querySelector(".search-button");
const titleContainer = document.querySelector(".chat-title-container");
const titleText = document.querySelector(".title-text");
const titleEditBtn = document.querySelector(".title-edit-btn");
const titleDeleteBtn = document.querySelector(".title-delete-btn");
const titleEditModal = document.getElementById("titleEditModal");
const deleteConfirmModal = document.getElementById("deleteConfirmModal");

// 常量和配置
const CONFIG = {
  MODEL: "deepseek-r1:14b",
  API_URL: "http://localhost:11434/api/generate",
  HISTORY_KEY: 'ollama_deepseek_history',
  MAX_HISTORY_SIZE: 100, // 限制历史记录大小
  COPY_TIMEOUT: 2000
};

// 应用状态
const STATE = {
  currentSessionId: null,
  selectionMode: false,
  selectedSessions: new Set(),
  chatHistory: []
};

// ===================== 标题显示与页面滚动 =====================
// 控制标题区域显示/隐藏
function updateTitleVisibility() {
  if (!STATE.currentSessionId || !STATE.chatHistory || STATE.chatHistory.length === 0) {
    // 如果没有当前会话或会话没有消息，隐藏标题区域
    titleContainer.style.display = 'none';
  } else {
    // 否则显示标题区域
    titleContainer.style.display = 'block';
  }
}

// 滚动到页面底部
function scrollToBottom() {
  content.scrollTo({
    top: content.scrollHeight,
    behavior: 'smooth'
  });
}

// ===================== 通知与加载动画 =====================
// 通知系统
function showNotification(message, type = 'info', duration = 3000) {
  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      ${type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' :
      type === 'success' ? '<i class="fas fa-check-circle"></i>' :
        '<i class="fas fa-info-circle"></i>'}
      <span>${message}</span>
    </div>
  `;

  // 添加到页面
  document.body.appendChild(notification);

  // 使用动画显示
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  // 定时关闭
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300); // 等待动画完成
  }, duration);
}

// 创建并显示加载动画
function showLoading() {
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'loading';
  loadingDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 思考中...';
  content.appendChild(loadingDiv);
  return loadingDiv;
}

// 隐藏加载动画
function hideLoading(loadingElement) {
  if (loadingElement && loadingElement.parentNode) {
    loadingElement.parentNode.removeChild(loadingElement);
  }
}

// 显示欢迎消息
function showWelcomeMessage() {
  const welcomeDiv = document.createElement('div');
  welcomeDiv.className = 'welcome-message';
  welcomeDiv.innerHTML = `
    <h3>欢迎使用 Deepseek-r1 AI助手</h3>
    <p>我可以帮助您回答问题、编写代码、解释概念等。请在下方输入您的问题。</p>
  `;
  content.appendChild(welcomeDiv);
}

// ===================== AI流式响应与消息渲染 =====================
// 实时显示流式输出
async function streamResponse(prompt) {
  try {
    if (!STATE.chatHistory) {
      STATE.chatHistory = [];
    }

    // Add user message to history
    STATE.chatHistory.push({ role: "user", content: prompt });

    // 有消息后显示标题
    updateTitleVisibility();

    // 滚动到底部以便看到加载动画
    scrollToBottom();

    const response = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        model: CONFIG.MODEL,
        prompt: prompt,
        messages: STATE.chatHistory,
        stream: true,
        options: {
          temperature: 0.3,
          top_p: 0.9,
        }
      }),
    });


    const reader = response.body.getReader();
    const left = document.createElement("div");
    left.classList.add("message", "message-ai");

    // 使用DocumentFragment提高DOM性能
    const fragment = document.createDocumentFragment();
    fragment.appendChild(left);
    content.appendChild(fragment);

    scrollToBottom(); // 添加AI消息框后滚动

    // 显示加载动画
    const loadingElement = showLoading();

    let result = "";
    let decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      try {
        const parsed = JSON.parse(chunk);
        result += parsed.response;
        left.innerHTML = chat(result);
        scrollToBottom();
      } catch (error) {
        console.error("解析响应失败:", error);
      }
    }
    STATE.chatHistory.push({ role: "chat", content: result });
    // 隐藏加载动画
    hideLoading(loadingElement);
    return result;
  } catch (error) {
    console.error("Stream Error:", error);
    // 显示错误通知
    showNotification('与Ollama服务通信失败，请检查服务是否正常运行。', 'error', 5000);
    return null;
  }
}

// 用户消息渲染
function user(result) {
  return `<div class="message message-user">
  <div class="content-text">${result}</div>
  </div>`
}

// ai回音渲染
function chat(result) {
  const converter = new showdown.Converter({
    tables: true,
    simplifiedAutoLink: true,
    strikethrough: true,
    tasklists: true
  });
  const html = converter.makeHtml(result);
  const div = document.createElement('div');
  div.className = 'content-text';
  div.innerHTML = html;

  // 处理代码块
  const codeBlocks = div.querySelectorAll('pre code');
  codeBlocks.forEach(codeBlock => {
    // 获取代码块的语言类型，如果没有则默认为'text'
    const rawLanguage = codeBlock.className.replace('language-', '') || 'text';
    // 从源头处理语言名称重复问题，例如将"javascript javascript"变成"javascript"
    // 正则表达式(\w+)\s+\1匹配重复的单词，并用$1替换为单个单词
    const language = rawLanguage.replace(/(\w+)\s+\1/g, '$1');
    // 获取代码块的文本内容
    const code = codeBlock.textContent;
    // 使用createCodeBlock函数创建增强的代码块，包含语言标签和复制按钮
    const enhancedCodeBlock = createCodeBlock(code, language);
    // 用增强的代码块替换原始的pre元素
    codeBlock.parentElement.replaceWith(enhancedCodeBlock);
  });

  // 处理完成后返回HTML
  return div.outerHTML;
}

// ===================== 代码块复制与高亮 =====================
// 创建增强的代码块元素
function createCodeBlock(code, language) {
  // 创建代码块容器
  const codeBlock = document.createElement('div');
  codeBlock.className = 'code-block';

  // 创建头部栏
  const header = document.createElement('div');
  header.className = 'code-header';

  // 语言标签
  const languageSpan = document.createElement('span');
  languageSpan.className = 'code-language';
  // 修复语言显示重复的问题
  languageSpan.textContent = language || 'text';

  // 复制按钮
  const copyButton = document.createElement('button');
  copyButton.className = 'copy-button';
  copyButton.innerHTML = '<i class="fas fa-copy"></i> 复制';
  copyButton.setAttribute('data-code', code); // 存储代码到按钮属性中

  // 添加到头部
  header.appendChild(languageSpan);
  header.appendChild(copyButton);
  codeBlock.appendChild(header);

  // 代码内容区域
  const pre = document.createElement('pre');
  const codeElement = document.createElement('code');
  codeElement.className = language ? `language-${language}` : '';
  codeElement.textContent = code;
  pre.appendChild(codeElement);
  codeBlock.appendChild(pre);

  return codeBlock;
}

// 复制成功后的反馈
function showCopySuccess(button) {
  const originalContent = button.innerHTML;
  button.innerHTML = '<i class="fas fa-check"></i> 已复制！';
  button.style.backgroundColor = '#e6f7e6';
  button.disabled = true;

  setTimeout(() => {
    button.innerHTML = originalContent;
    button.style.backgroundColor = '';
    button.disabled = false;
  }, CONFIG.COPY_TIMEOUT);
}

// 复制失败后的反馈
function showCopyError(button) {
  const originalContent = button.innerHTML;
  button.innerHTML = '<i class="fas fa-times"></i> 复制失败';
  button.style.backgroundColor = '#ffe6e6';

  setTimeout(() => {
    button.innerHTML = originalContent;
    button.style.backgroundColor = '';
  }, CONFIG.COPY_TIMEOUT);
}

// 全局代码复制事件处理
function handleCopyButtonClick(event) {
  // 检查点击的是不是复制按钮
  const button = event.target.closest('.copy-button');
  if (!button) return;

  const code = button.getAttribute('data-code'); // 从按钮属性中获取代码

  // 尝试复制 - 首先使用现代剪贴板API
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(code)
      .then(() => showCopySuccess(button))
    // .catch(() => fallbackCopyMethod(code, button));
  }
  // else {
  //   // 回退到传统方法
  //   fallbackCopyMethod(code, button);
  // }
}

// // 传统的复制方法（兼容性更好）
// function fallbackCopyMethod(text, button) {
//   try {
//     // 创建临时文本区域
//     const textArea = document.createElement('textarea');
//     textArea.value = text;

//     // 设置样式使其不可见
//     textArea.style.position = 'fixed';
//     textArea.style.left = '-999999px';
//     textArea.style.top = '-999999px';
//     document.body.appendChild(textArea);

//     // 保存当前活动元素
//     const activeElement = document.activeElement;

//     // 选择并复制
//     textArea.focus();
//     textArea.select();

//     // 执行复制命令
//     const successful = document.execCommand('copy');

//     // 恢复焦点
//     if (activeElement) {
//       activeElement.focus();
//     }

//     // 移除临时元素
//     document.body.removeChild(textArea);

//     // 根据结果显示反馈
//     if (successful) {
//       showCopySuccess(button);
//     } else {
//       showCopyError(button);
//     }
//   } catch (err) {
//     console.error('复制失败:', err);
//     showCopyError(button);
//     showNotification('复制失败: ' + (err.message || '未知错误'), 'error');
//   }
// }

// ===================== 会话管理器 =====================
// 会话管理功能，包含历史记录的增删查改、分片存储等
const SessionManager = {
  // 获取历史记录
  getHistory() {
    try {
      // 先尝试从新键名获取
      let history = localStorage.getItem(CONFIG.HISTORY_KEY);
      console.log("从新键获取历史记录:", CONFIG.HISTORY_KEY, history ? "找到数据" : "无数据");

      // 如果所有尝试都失败，返回空数组
      if (!history) {
        console.log("未找到数据，返回空数组");
        return [];
      }

      try {
        const parsed = JSON.parse(history || '[]');
        console.log("解析后的历史记录数量:", parsed.length);
        return parsed;
      } catch (parseError) {
        console.error("JSON解析失败:", parseError);
        showNotification('历史记录格式无效', 'error');
        return [];
      }
    } catch (error) {
      console.error("获取历史记录失败:", error);
      showNotification('历史记录加载失败', 'error');
      return [];
    }
  },

  // 保存历史记录
  saveHistory(history) {
    try {
      console.log("尝试保存历史记录，数量:", history.length);

      // 确保history是数组
      if (!Array.isArray(history)) {
        console.error("保存失败：history不是数组");
        showNotification('历史记录格式错误', 'error');
        return false;
      }

      // 限制历史记录大小
      if (history.length > CONFIG.MAX_HISTORY_SIZE) {
        history = history.slice(0, CONFIG.MAX_HISTORY_SIZE);
      }

      // 序列化历史记录
      const serialized = JSON.stringify(history);
      console.log("序列化后的历史记录长度:", serialized.length);

      try {
        localStorage.setItem(CONFIG.HISTORY_KEY, serialized);
        const testRead = localStorage.getItem(CONFIG.HISTORY_KEY);
        if (testRead && testRead.length > 0) {
          console.log("历史记录保存成功");
        }
      } catch (e) {
        console.error("localStorage保存失败:", e.message);
      }
    } catch (error) {
      console.error("保存历史记录失败:", error);
      showNotification('历史记录保存失败: ' + (error.message || '未知错误'), 'error');
      return false;
    }
  },

  // 创建新会话
  createNewSession(message) {
    return {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      title: message.substring(0, 30),
      messages: []
    };
  },

  // 加载会话消息
  loadSession(sessionId) {
    const history = this.getHistory();
    const session = history.find(s => s.id == sessionId);

    if (!session) return false;

    // 设置当前会话ID
    STATE.currentSessionId = sessionId;

    // 加载会话消息
    this.loadSessionMessages(session);

    // 更新标题
    updateChatTitle(session.title);

    // 更新活动状态
    const allItems = document.querySelectorAll('aside ul li');
    allItems.forEach(item => item.classList.remove('active'));
    const currentItem = document.querySelector(`aside ul li[data-id="${sessionId}"]`);
    if (currentItem) {
      currentItem.classList.add('active');
    }

    return true;
  },

  // 加载会话消息
  loadSessionMessages(session) {
    // 清空当前聊天内容
    content.innerHTML = '';

    // 重新渲染会话消息
    session.messages.forEach(msg => {
      if (msg.role === 'user') {
        content.innerHTML += user(msg.content);
      } else if (msg.role === 'chat') {
        const left = document.createElement("div");
        left.classList.add("message", "message-ai");
        left.innerHTML = chat(msg.content);
        content.appendChild(left);
      }
    });

    // 更新chatHistory
    STATE.chatHistory = [...session.messages];

    // 更新标题可见性
    updateTitleVisibility();
  },

  // 删除会话
  deleteSession(sessionId) {
    const history = this.getHistory();
    const newHistory = history.filter(item => item.id != sessionId);
    this.saveHistory(newHistory);

    // 如果删除的是当前会话，重置当前状态
    if (STATE.currentSessionId == sessionId) {
      this.resetCurrentChat();
    }

    // 刷新历史记录列表
    this.renderHistoryList();

    return true;
  },

  // 清空所有历史记录
  clearAllHistory() {
    try {
      // 清除主存储
      localStorage.removeItem(CONFIG.HISTORY_KEY);

      this.resetCurrentChat();
      this.renderHistoryList();
      return true;
    } catch (error) {
      console.error("清空历史记录失败:", error);
      showNotification('清空历史记录失败', 'error');
      return false;
    }
  },

  // 更新会话标题
  updateSessionTitle(sessionId, newTitle) {
    if (!newTitle.trim()) return false;

    const history = this.getHistory();
    const index = history.findIndex(item => item.id == sessionId);

    if (index === -1) return false;

    history[index].title = newTitle;
    this.saveHistory(history);

    // 更新显示
    updateChatTitle(newTitle);
    this.renderHistoryList();

    return true;
  },

  // 重置当前会话状态
  resetCurrentChat() {
    content.innerHTML = '';
    STATE.currentSessionId = null;
    STATE.chatHistory = [];

    // 添加欢迎消息
    showWelcomeMessage();

    // 更新标题
    updateChatTitle('新对话');

    // 更新标题可见性
    updateTitleVisibility();
  },

  // 渲染历史记录列表
  renderHistoryList() {
    try {
      const history = this.getHistory();
      console.log("渲染历史记录:", history.length, "条");

      const list = document.querySelector('aside ul');
      if (!list) {
        console.error("找不到历史记录列表元素");
        return;
      }

      list.innerHTML = '';

      if (history.length === 0) {
        // 如果没有历史记录，显示提示
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-history';
        emptyDiv.textContent = '暂无历史记录';
        list.appendChild(emptyDiv);
        return;
      }

      history.forEach(item => {
        const li = document.createElement('li');
        li.setAttribute('data-id', item.id);
        li.className = STATE.currentSessionId == item.id ? "active selectable" : "selectable";

        // 创建历史内容部分
        const content = document.createElement('div');
        content.className = 'history-item-content';

        const title = document.createElement('div');
        title.className = 'history-title';
        title.textContent = item.title;

        const time = document.createElement('div');
        time.className = 'history-time';
        time.textContent = new Date(item.timestamp).toLocaleString();

        content.appendChild(title);
        content.appendChild(time);

        // 创建三点图标容器
        const iconContainer = document.createElement('div');
        iconContainer.className = 'checkbox-container';

        const actionIcon = document.createElement('div');
        actionIcon.className = 'history-actions-icon';
        actionIcon.innerHTML = '<i class="fas fa-ellipsis-v"></i>';

        iconContainer.appendChild(actionIcon);

        // 添加到li
        li.appendChild(content);
        li.appendChild(iconContainer);

        // 创建菜单元素
        const menu = document.createElement('div');
        menu.className = 'history-actions-menu';
        menu.setAttribute('data-id', item.id);

        const editItem = document.createElement('div');
        editItem.className = 'history-actions-menu-item edit';
        editItem.innerHTML = '<i class="fas fa-edit"></i> 编辑';

        const deleteItem = document.createElement('div');
        deleteItem.className = 'history-actions-menu-item delete';
        deleteItem.innerHTML = '<i class="fas fa-trash"></i> 删除';

        menu.appendChild(editItem);
        menu.appendChild(deleteItem);

        // 添加菜单到li
        li.appendChild(menu);

        // 添加li到列表
        list.appendChild(li);
      });
    } catch (error) {
      console.error("渲染历史记录失败:", error);
      showNotification('历史记录渲染失败', 'error');
    }
  }
};

// ===================== 标题与模态框相关 =====================
// 更新聊天标题显示
function updateChatTitle(title) {
  titleText.textContent = title || '新对话';
}

// 显示模态框
function showModal(modal) {
  modal.classList.add('show');
}

// 隐藏模态框
function hideModal(modal) {
  modal.classList.remove('show');
}

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// ===================== 发送请求主逻辑 =====================
// 发送请求
async function Send() {
  if (input.value.trim() === "") return;
  const inputs = input.value
  input.value = "";

  try {

    let session;
    let history = SessionManager.getHistory();



    if (!STATE.currentSessionId || !history.find(s => s.id === STATE.currentSessionId)) {
      // 只在没有当前会话ID或找不到对应会话时创建新会话
      console.log("创建新会话");
      session = SessionManager.createNewSession(inputs);
      STATE.currentSessionId = session.id;
      history.unshift(session); // 将新会话添加到历史记录开头
      // 更新标题显示
      updateChatTitle(session.title);
    } else {
      // 使用现有会话
      // console.log("使用现有会话:", STATE.currentSessionId);
      session = history.find(s => s.id === STATE.currentSessionId);
    }

    console.log(history);
    // 添加用户消息
    session.messages.push({ role: "user", content: inputs });
    // 立即保存用户消息
    SessionManager.saveHistory(history)

    content.innerHTML += user(inputs);
    scrollToBottom(); // 添加用户消息后滚动

    // 更新标题可见性
    updateTitleVisibility();

    // 获取AI响应
    // console.log("开始请求AI响应");
    const aiResponse = await streamResponse(JSON.stringify(inputs));
    if (aiResponse) {
      console.log("收到AI响应，长度:", aiResponse.length);
      session.messages.push({ role: "chat", content: aiResponse });
      SessionManager.saveHistory(history)
    }

  } catch (error) {
    console.error("发送请求错误:", error);
    // 显示错误信息给用户
    const errorDiv = document.createElement("div");
    errorDiv.classList.add("message", "message-ai", "error-message");
    errorDiv.innerHTML = '<div class="content-text">请求发生错误，请检查网络连接或Ollama服务是否正常运行。</div>';
    content.appendChild(errorDiv);

    // 添加错误消息到会话
    if (STATE.currentSessionId) {
      const history = SessionManager.getHistory();
      const session = history.find(s => s.id === STATE.currentSessionId);
      if (session) {
        session.messages.push({ role: "chat", content: "请求发生错误，请检查网络连接或Ollama服务是否正常运行。" });
        SessionManager.saveHistory(history)
      }
    }

    // 显示错误通知
    showNotification('请求发生错误，请检查网络连接或Ollama服务是否正常运行。', 'error', 5000);
    // 无论失败还是成功都会执行
  } finally {
    // 渲染历史记录
    SessionManager.renderHistoryList();
  }
}

// ===================== 事件监听与初始化 =====================
// 初始化事件监听器
function setupEventListeners() {
  // 发送按钮点击
  send.addEventListener("click", debounce(() => {
    Send();
  }, 300));

  // 输入框回车
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // 防止默认行为
      debounce(() => Send(), 300)();
    }
  });

  // 标题编辑按钮
  titleEditBtn.addEventListener('click', () => {
    if (!STATE.currentSessionId) return;

    const history = SessionManager.getHistory();
    const session = history.find(item => item.id == STATE.currentSessionId);
    if (!session) return;

    // 设置输入框初始值
    document.getElementById('titleInput').value = session.title;

    // 显示编辑模态框
    showModal(titleEditModal);
  });

  // 标题删除按钮
  titleDeleteBtn.addEventListener('click', () => {
    if (!STATE.currentSessionId) return;
    showModal(deleteConfirmModal);
  });

  // 模态框关闭按钮
  document.querySelectorAll('.close-modal').forEach(button => {
    button.addEventListener('click', () => {
      hideModal(button.closest('.modal'));
    });
  });

  // 保存编辑标题
  document.getElementById('saveTitleEdit').addEventListener('click', () => {
    if (!STATE.currentSessionId) return;

    const newTitle = document.getElementById('titleInput').value.trim();
    if (SessionManager.updateSessionTitle(STATE.currentSessionId, newTitle)) {
      hideModal(titleEditModal);
    }
  });

  // 取消编辑标题
  document.getElementById('cancelTitleEdit').addEventListener('click', () => {
    hideModal(titleEditModal);
  });

  // 确认删除当前会话
  document.getElementById('confirmDelete').addEventListener('click', () => {
    if (!STATE.currentSessionId) return;
    if (SessionManager.deleteSession(STATE.currentSessionId)) {
      hideModal(deleteConfirmModal);
    }
  });

  // 取消删除
  document.getElementById('cancelDelete').addEventListener('click', () => {
    hideModal(deleteConfirmModal);
  });

  // 清空历史记录
  document.querySelector('.remove').addEventListener('click', () => {
    if (confirm("确定要清空所有历史记录吗？此操作不可恢复。")) {
      if (SessionManager.clearAllHistory()) {
        showNotification('历史记录已清空', 'success');
      }
    }
  });

  // 使用事件委托处理历史记录交互
  document.querySelector('aside ul').addEventListener('click', (e) => {
    // 处理三点菜单图标点击
    if (e.target.closest('.history-actions-icon')) {
      e.stopPropagation();
      const icon = e.target.closest('.history-actions-icon');
      const listItem = icon.closest('li');
      const sessionId = listItem.getAttribute('data-id');

      // 关闭所有其他菜单
      document.querySelectorAll('.history-actions-menu.active').forEach(menu => {
        menu.classList.remove('active');
      });

      // 找到与此sessionId关联的菜单
      const menu = document.querySelector(`.history-actions-menu[data-id="${sessionId}"]`);
      if (menu) {
        menu.classList.toggle('active');
      }
      return;
    }

    // 处理编辑按钮点击
    if (e.target.closest('.history-actions-menu-item.edit')) {
      e.stopPropagation();
      const editBtn = e.target.closest('.history-actions-menu-item.edit');
      const menu = editBtn.closest('.history-actions-menu');
      const sessionId = parseInt(menu.getAttribute('data-id'));

      // 加载会话
      if (SessionManager.loadSession(sessionId)) {
        // 关闭菜单
        menu.classList.remove('active');
        // 打开编辑标题模态框
        titleEditBtn.click();
      }
      return;
    }

    // 处理删除按钮点击
    if (e.target.closest('.history-actions-menu-item.delete')) {
      e.stopPropagation();
      const deleteBtn = e.target.closest('.history-actions-menu-item.delete');
      const menu = deleteBtn.closest('.history-actions-menu');
      const sessionId = parseInt(menu.getAttribute('data-id'));

      // 加载会话
      if (SessionManager.loadSession(sessionId)) {
        // 关闭菜单
        menu.classList.remove('active');
        // 打开删除确认模态框
        titleDeleteBtn.click();
      }
      return;
    }

    // 处理历史记录项点击
    const historyItem = e.target.closest('li.selectable');
    if (historyItem && !e.target.closest('.history-actions-icon') && !e.target.closest('.history-actions-menu')) {
      const sessionId = parseInt(historyItem.getAttribute('data-id'));
      SessionManager.loadSession(sessionId);
    }
  });

  // 全局点击事件，关闭打开的菜单
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.history-actions-icon') && !e.target.closest('.history-actions-menu')) {
      document.querySelectorAll('.history-actions-menu.active').forEach(menu => {
        menu.classList.remove('active');
      });
    }
  });

  // 代码复制功能
  document.body.addEventListener('click', handleCopyButtonClick);
  // 新开会话
  document.querySelector('.newadd').addEventListener('click', () => {
    createNewChat()
  })
}

// 创建新会话并重置当前页面
function createNewChat() {
  SessionManager.resetCurrentChat();
  // 焦点放在输入框
  input.focus();
}

// 初始化应用
function initApp() {
  try {
    console.log("=== 开始初始化应用 ===");

    // 初始化DOM元素
    console.log("DOM元素状态检查:");
    console.log("- aside元素:", document.querySelector('aside') ? "已找到" : "未找到");
    console.log("- 历史记录列表:", document.querySelector('aside ul') ? "已找到" : "未找到");
    console.log("- 内容区域:", content ? "已找到" : "未找到");

    // 查看localStorage状态
    console.log("localStorage状态:");
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      console.log(`- 键: ${key}, 长度: ${localStorage.getItem(key).length}`);
    }

    // 初始化会话管理器
    console.log("开始渲染历史记录列表");
    SessionManager.renderHistoryList();

    // 设置事件监听器
    console.log("设置事件监听器");
    setupEventListeners();

    // 更新标题可见性
    console.log("更新标题可见性");
    updateTitleVisibility();

    // 显示欢迎消息
    console.log("显示欢迎消息");
    showWelcomeMessage();

    console.log("=== 应用初始化完成 ===");
  } catch (error) {
    console.error("初始化应用失败:", error);
    showNotification('应用初始化失败', 'error', 5000);
  }
}

// 初始化
window.addEventListener("DOMContentLoaded", function () {
  console.log("DOM内容已加载");

  // 延迟一些时间确保DOM完全准备好
  setTimeout(() => {
    console.log("开始延迟初始化");
    // 执行初始化
    initApp();
  }, 200);
});


