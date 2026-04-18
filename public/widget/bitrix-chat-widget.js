/**
 * Knowledge Share Bot - Bitrix24 Chat Widget SDK (Secure Version)
 * 
 * ВАЖНО: API-ключ НЕ передаётся на клиент!
 * Авторизация происходит через JWT-токен на основе portal_domain.
 * 
 * Использование в Bitrix24:
 * 
 * <!DOCTYPE html>
 * <html>
 * <head>
 *   <script src="//api.bitrix24.com/api/v1/"></script>
 *   <script src="https://apt728.ru/widget/bitrix-chat-widget.js"></script>
 * </head>
 * <body>
 *   <div id="knowledge-chat" style="height: 100vh;"></div>
 *   <script>
 *     BX24.init(function() {
 *       BX24.callMethod('user.current', {}, function(result) {
 *         if (result.error()) {
 *           console.error(result.error());
 *           return;
 *         }
 *         
 *         var user = result.data();
 *         var placement = BX24.placement.info();
 *         
 *         KnowledgeChat.init({
 *           containerId: 'knowledge-chat',
 *           portal: placement.DOMAIN,
 *           bitrixUserId: user.ID,
 *           userName: user.NAME + ' ' + user.LAST_NAME,
 *           userEmail: user.EMAIL
 *         });
 *       });
 *     });
 *   </script>
 * </body>
 * </html>
 */

(function(global) {
  'use strict';

  var KnowledgeChat = {
    version: '2.0.0',
    baseUrl: 'https://knowledge-share-bot.lovable.app',
    
    /**
     * Инициализирует виджет чата (безопасная версия)
     * @param {Object} config - Конфигурация
     * @param {string} config.containerId - ID контейнера для виджета
     * @param {string} config.portal - Домен портала Bitrix24 (например: company.bitrix24.ru)
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
      if (!config.portal) {
        console.error('[KnowledgeChat] portal is required');
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

      // Build widget URL with params (NO API KEY!)
      var params = new URLSearchParams();
      params.set('portal', config.portal);
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

      var widgetUrl = this.baseUrl + '/bitrix-chat?' + params.toString();

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
      this._config = config;

      console.log('[KnowledgeChat] Widget initialized (secure mode)');
      
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
      this._config = null;
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
    },

    /**
     * Получает текущую конфигурацию
     */
    getConfig: function() {
      return this._config ? Object.assign({}, this._config) : null;
    }
  };

  // Export to global
  global.KnowledgeChat = KnowledgeChat;

})(typeof window !== 'undefined' ? window : this);
