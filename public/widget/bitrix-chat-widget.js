/**
 * Knowledge Share Bot - Bitrix24 Chat Widget SDK
 * 
 * Использование:
 * 
 * <div id="knowledge-chat" style="height: 600px;"></div>
 * <script src="https://knowledge-share-bot.lovable.app/widget/bitrix-chat-widget.js"></script>
 * <script>
 *   KnowledgeChat.init({
 *     containerId: 'knowledge-chat',
 *     apiKey: 'YOUR_DEPARTMENT_API_KEY',
 *     bitrixUserId: BX24.placement.info.userId,
 *     userName: BX24.placement.info.userFullName
 *   });
 * </script>
 */

(function(global) {
  'use strict';

  var KnowledgeChat = {
    version: '1.0.0',
    baseUrl: 'https://knowledge-share-bot.lovable.app',
    
    /**
     * Инициализирует виджет чата
     * @param {Object} config - Конфигурация
     * @param {string} config.containerId - ID контейнера для виджета
     * @param {string} config.apiKey - API ключ отдела
     * @param {string|number} config.bitrixUserId - ID пользователя в Bitrix24
     * @param {string} [config.userName] - Имя пользователя (опционально)
     * @param {string} [config.userEmail] - Email пользователя (опционально)
     * @param {string} [config.theme] - Тема: 'light' или 'dark' (опционально)
     */
    init: function(config) {
      if (!config.containerId) {
        console.error('[KnowledgeChat] containerId is required');
        return;
      }
      if (!config.apiKey) {
        console.error('[KnowledgeChat] apiKey is required');
        return;
      }
      if (!config.bitrixUserId) {
        console.error('[KnowledgeChat] bitrixUserId is required');
        return;
      }

      var container = document.getElementById(config.containerId);
      if (!container) {
        console.error('[KnowledgeChat] Container not found: ' + config.containerId);
        return;
      }

      // Build widget URL with params
      var params = new URLSearchParams();
      params.set('apiKey', config.apiKey);
      params.set('bitrixUserId', String(config.bitrixUserId));
      if (config.userName) {
        params.set('userName', config.userName);
      }
      if (config.userEmail) {
        params.set('userEmail', config.userEmail);
      }
      if (config.theme) {
        params.set('theme', config.theme);
      }

      var widgetUrl = this.baseUrl + '/widget/chat?' + params.toString();

      // Create iframe
      var iframe = document.createElement('iframe');
      iframe.src = widgetUrl;
      iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:8px;';
      iframe.allow = 'clipboard-write';
      iframe.title = 'AI Chat Widget';

      // Clear container and append iframe
      container.innerHTML = '';
      container.appendChild(iframe);

      // Store reference
      this._iframe = iframe;
      this._container = container;

      console.log('[KnowledgeChat] Widget initialized');
      
      return this;
    },

    /**
     * Уничтожает виджет
     */
    destroy: function() {
      if (this._container) {
        this._container.innerHTML = '';
      }
      this._iframe = null;
      this._container = null;
    },

    /**
     * Перезагружает виджет
     */
    reload: function() {
      if (this._iframe) {
        this._iframe.src = this._iframe.src;
      }
    },

    /**
     * Проверяет готовность SDK
     */
    isReady: function() {
      return !!this._iframe;
    }
  };

  // Export to global
  global.KnowledgeChat = KnowledgeChat;

})(typeof window !== 'undefined' ? window : this);
