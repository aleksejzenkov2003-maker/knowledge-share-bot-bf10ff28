/**
 * Knowledge Share Bot - Bitrix24 Chat Widget SDK v3.0
 * 
 * Supports both Personal Chat and Department Chat
 * 
 * Usage in Bitrix24:
 * 
 * <!DOCTYPE html>
 * <html>
 * <head>
 *   <script src="//api.bitrix24.com/api/v1/"></script>
 *   <script src="https://apt728.ru/widget/bitrix-chat-widget-v3.js"></script>
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
 *           userEmail: user.EMAIL,
 *           chatType: 'personal' // or 'department'
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
    version: '3.1.0',
    baseUrl: 'https://apt728.ru',
    
    /**
     * Initialize chat widget
     * @param {Object} config - Configuration
     * @param {string} config.containerId - Container element ID
     * @param {string} config.portal - Bitrix24 portal domain
     * @param {string|number} config.bitrixUserId - Bitrix24 user ID
     * @param {string} [config.userName] - User name (optional)
     * @param {string} [config.userEmail] - User email (optional)
     * @param {string} [config.chatType] - Chat type: 'personal' or 'department' (default: 'personal')
     * @param {string} [config.theme] - Theme: 'light' or 'dark' (optional)
     * 
     * Note: Department is auto-detected from user's profile. 
     * If user doesn't have a department yet, they'll be assigned to the first department 
     * associated with the portal. Admins can reassign users to different departments.
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

      // Determine chat route based on chatType
      var chatType = config.chatType || 'personal';
      var chatRoute = chatType === 'department' ? '/bitrix-department' : '/bitrix-personal';

      // Build widget URL with params (NO API KEY!)
      // Department is auto-detected from user profile on the backend
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

      var widgetUrl = this.baseUrl + chatRoute + '?' + params.toString();

      // Create iframe
      var iframe = document.createElement('iframe');
      iframe.src = widgetUrl;
      iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:8px;';
      iframe.allow = 'clipboard-write';
      iframe.title = chatType === 'department' ? 'Department AI Chat' : 'Personal AI Chat';

      // Clear container and append iframe
      container.innerHTML = '';
      container.appendChild(iframe);

      // Store reference
      this._iframe = iframe;
      this._container = container;
      this._config = config;

      console.log('[KnowledgeChat] Widget initialized - type:', chatType, '(department auto-detected)');
      
      return this;
    },

    /**
     * Switch chat type
     * @param {string} chatType - 'personal' or 'department'
     */
    switchChatType: function(chatType) {
      if (!this._config) {
        console.error('[KnowledgeChat] Widget not initialized');
        return;
      }

      this._config.chatType = chatType;
      this.init(this._config);
    },

    /**
     * Destroy widget
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
     * Reload widget
     */
    reload: function() {
      if (this._iframe) {
        this._iframe.src = this._iframe.src;
      }
    },

    /**
     * Check if SDK is ready
     */
    isReady: function() {
      return !!this._iframe;
    },

    /**
     * Get current configuration
     */
    getConfig: function() {
      return this._config ? Object.assign({}, this._config) : null;
    },

    /**
     * Get current chat type
     */
    getChatType: function() {
      return this._config ? this._config.chatType || 'personal' : null;
    }
  };

  // Export to global
  global.KnowledgeChat = KnowledgeChat;

})(typeof window !== 'undefined' ? window : this);
