class CCBar {
    constructor(options = {}) {
      // 默认配置
      this.defaultOptions = {
        eventHandle: {
          onError: () => {},
          onRecviceCall: () => {},
          onStatusChange: () => {},
          onWebPhoneHandle: () => {}
        }
      };

      // 合并配置
      this.options = { ...this.defaultOptions, ...options };
      
      // 状态变量
      this.status = {
        workStatus: 'online',
        serviceStatus: 'idle',
        sipStatus: 'unreg',
        signedIn: false
      };
      
      // SIP 相关
      this.ua = null;
      this.session = null;
      this.loginTimeout = null;
      // 初始化UI
      this.initUI();
      // JsSIP.debug.enable('*');
    }

    // 初始化UI元素引用
    initUI() {
      this.ui = {
        workStatus: document.getElementById('____ccbar_wor_status____'),
        serStatus: document.getElementById('____ccbar_ser_status____'),
        sipStatus: document.getElementById('____ccbar_sip_status____'),
        numberInput: document.getElementById('____ccbar_numb_input____'),
        errorInfo: document.getElementById('____ccbar_errori____'),
        // SIP 手动输入
        urlInput: document.getElementById('____ccbar_url_input____'),
        usernameInput: document.getElementById('____ccbar_username_input____'),
        passwordInput: document.getElementById('____ccbar_password_input____'),
        wssPortInput: document.getElementById('____ccbar_wss_port_input____'),
        turnIpInput: document.getElementById('____ccbar_turn_ip_input____'),
        turnPortInput: document.getElementById('____ccbar_turn_port_input____'),
      };
    }

    /**
     * 从页面输入框获取 SIP 登录配置
     */
    getLoginConfigFromUI() {
      const url = this.ui.urlInput?.value?.trim();
      const username = this.ui.usernameInput?.value?.trim();
      const password = this.ui.passwordInput?.value?.trim();
      const wssPort = this.ui.wssPortInput?.value?.trim() || '8443';
      const turnIp = this.ui.turnIpInput?.value?.trim() || url;
      const turnPort = this.ui.turnPortInput?.value?.trim() || '3478';
      return {
        url, username, password, wssPort, turnIp, turnPort,
        register: true
      };
    }
  
    /**
     * 外呼 - 从号码输入框读取并呼叫，供页面 onclick 调用
     */
    doCall() {
      const number = this.ui?.numberInput?.value?.trim();
      if (number) this.call(number);
      else this.setError('请输入号码');
    }

    login(config) {
      // 清除之前的定时器
      if (this.loginTimeout) {
        clearTimeout(this.loginTimeout);
      }

      // 设置新的定时器
      this.loginTimeout = setTimeout(() => {
        this._executeLogin(config);
      }, 300);
    }
    
    // 登录功能
    _executeLogin(config) {
      if (this.ua && this.ua.isConnected()) {
        this.setError('已经登录，无需重复登录');
        return;
      }
        
      this.clearError();
      if (!config || !config.url || !config.username || !config.password) {
        this.setError('缺少必要的登录参数');
        return;
      }

      config.register = config.register === false ? false : true;
      this.options = {
        ...this.options,
        ...config
      }

      try {
        this.setStatus('sipStatus', 'connecting');

        // 初始化JsSIP
        this.ua = new JsSIP.UA({
          // SIP 用户标识，格式：sip:用户名@域名;transport=tcp
          uri: `sip:${config.username}@${config.url};transport=tcp`,
          // SIP 认证密码
          password: config.password,
          // WebSocket 连接地址，用于 SIP over WebSocket
          sockets: [new JsSIP.WebSocketInterface(`wss://${config.url}:${config.wssPort}`)],
          // 是否自动向注册服务器注册
          register: true,
          // 注册过期时间（秒），到期后自动重新注册
          register_expires: 600,
          // 是否启用会话定时器（Session Timers），用于保活
          session_timers: false,
          // 调试：设为 true 可打印 SIP 信令，便于排查问题
          // trace_sip: false,
          // WebRTC/ICE 配置，用于 NAT 穿透和媒体连接
          pcConfig: { 
            iceServers: [{ 
              // STUN 服务器地址，用于获取公网映射
              urls: `stun:${this.options.turnIp}:${this.options.turnPort}`
            }] 
          },
        });

        console.log(config);
        
  
        // 注册事件处理
        this.ua.on('connected', () => {
          this.setStatus('sipStatus', 'connected');
          this.options.eventHandle.onWebPhoneHandle('ua.connected');
        });
  
        this.ua.on('disconnected', (e) => {
          this.setStatus('sipStatus', 'unregistered');
          this.status.signedIn = false;
          this.setStatus('workStatus', 'offline');
          console.error('离线:', e);
          this.options.eventHandle.onWebPhoneHandle('ua.disconnected', e);
        });
  
        this.ua.on('registered', () => {
          this.setStatus('sipStatus', 'registered');
          this.status.signedIn = true;
          this.setStatus('workStatus', 'online');
          this.setStatus('serviceStatus', 'idle');
          this.options.eventHandle.onWebPhoneHandle('reg.registered');
        });
  
        this.ua.on('unregistered', () => {
          this.setStatus('sipStatus', 'unregistered');
          this.options.eventHandle.onWebPhoneHandle('reg.unregistered');
        });
  
        this.ua.on('registrationFailed', (e) => {
          this.setStatus('sipStatus', 'failed');
          this.status.signedIn = false;
          this.setError('SIP 注册失败: ' + (e.cause || e.error || '未知原因'));
          console.error('Registration failed:', e);
          this.options.eventHandle.onWebPhoneHandle('reg.failed');
        });
  
        this.ua.on('newRTCSession', (data) => {
          console.log('新会话:', data);
          this.handleNewSession(data.session);
        });
  
        // 开始连接
        this.ua.start();
      } catch (error) {
        console.log('初始化SIP失败:', error);
        this.status.signedIn = false;
        this.setError('初始化SIP失败: ' + error.message);
        this.setStatus('sipStatus', 'error');
      }
    }

    // 处理新会话
    handleNewSession(session) {
      this.setStatus('serviceStatus', 'busy');
      this.session = session;

      // Common event listeners setup with safety checks
      const setupCommonListeners = () => {
        try {
          if (!session.connection) {
            console.warn('RTCPeerConnection not yet available');

            session.on('peerconnection', (e) => {
              const connection = e.peerconnection;

              connection.addEventListener('track', (event) => {
                if (event.track.kind === 'audio') {
                  console.log(`收到远程音频流-${session.direction === 'incoming' ? '来电' : '去电'}`);
                  console.log(session,'sessionsessionsession');
                  
                  this.handleAudioStream(event.track);
                }
              });
            
              connection.addEventListener('iceconnectionstatechange', () => {
                console.log('ICE 连接状态:', connection.iceConnectionState);
              });
            });

            return;
          }
        
          // If connection already exists, add listeners directly
          session.connection.addEventListener('track', (event) => {
            if (event.track.kind === 'audio') {
              console.log(`收到远程音频流-${session.direction === 'incoming' ? '来电' : '去电'}`);
              this.handleAudioStream(event.track);
            }
          });
        
          session.connection.addEventListener('iceconnectionstatechange', () => {
            console.log('ICE 连接状态:', session.connection.iceConnectionState);
          });
        
        } catch (error) {
          console.error('设置WebRTC监听器时出错:', error);
          this.setError('设置音频连接失败: ' + error.message);
        }
      };
    
      // Handle incoming call specific events
      if (session.direction === 'incoming') {
        this.options.eventHandle.onWebPhoneHandle('incoming.notify');
        console.log('来电');
        const caller = session.remote_identity.display_name || session.remote_identity.uri.user;
        this.options.eventHandle.onRecviceCall(caller, { callid: session.id });
      
        session.on('accepted', () => {
          this.options.eventHandle.onWebPhoneHandle('incoming.accepted');
        });

        session.on('ended', (data) => {
          this.setStatus('serviceStatus', 'idle');
          this.setStatus('workStatus', 'online');
          this.options.eventHandle.onWebPhoneHandle('incoming.ended', data);
          this.session = null;
        });

        session.on('failed', (data) => {
          this.setStatus('serviceStatus', 'idle');
          this.setStatus('workStatus', 'online');
          this.options.eventHandle.onWebPhoneHandle('incoming.failed', data);
          this.session = null;
        });
      
        session.on('hold', (data) => {
          this.setStatus('serviceStatus', 'hold');
          this.options.eventHandle.onWebPhoneHandle('call.hold', data);
        });

        session.on('unhold', (data) => {
          this.setStatus('serviceStatus', 'busy');
          this.options.eventHandle.onWebPhoneHandle('call.unhold', data);
        });
      }
    
      setupCommonListeners();
    }

    //音频处理
    handleAudioStream(stream) {
      const remoteAudio = document.getElementById('remoteAudio');
      remoteAudio.srcObject = new MediaStream([stream]);
        // 处理自动播放策略
        remoteAudio.play().catch(error => {
          console.error('自动播放被阻止:', error);
          // 可以在这里添加用户交互来解除阻止
          this.setError('请点击页面任意位置启用音频');
          document.body.addEventListener('click', () => {
            remoteAudio.play().then(() => {
              this.clearError();
            }).catch(e => console.error('仍无法播放:', e));
          }, { once: true });
        });
    }

    // 外呼功能
    async call(number) {
      this.clearError();
      if (this.session) {
        this.setError('已有通话在进行');
        return;
      }
      
      try {
        if (!this.ua || !this.ua.isConnected()) {
          this.setError('SIP未连接');
          return;
        }

        if (this.status.workStatus === 'reset') {
          return
        }
    
        const eventHandlers = {
          progress: (data) => {
            console.log('呼叫中...',data)
            this.options.eventHandle.onWebPhoneHandle('outgoing.progress', data);
          },
          failed: (data) => {
            console.error('呼叫失败:', data);
            this.options.eventHandle.onWebPhoneHandle('outgoing.failed', data);
            this.session = null;
            this.setStatus('serviceStatus', 'idle');
          },  
          ended: (data) => {
            console.log('通话已结束...', data);
            this.setStatus('serviceStatus', 'idle');
            this.options.eventHandle.onWebPhoneHandle('outgoing.ended', data);
            this.session = null;
          },
          accepted: (data) => {
            console.log('通话已接通...',data)
            this.options.eventHandle.onWebPhoneHandle('outgoing.accepted', data);
            this.setStatus('serviceStatus', 'calling');
          }
        };
  
        this.setStatus('serviceStatus', 'calling');

        this.ua.call(number, {
          eventHandlers,
          mediaConstraints: { audio: true, video: false },
          sessionTimersExpires: 120
        });
      } catch (error) {
        this.setError('呼叫失败: ' + error.message);
      }
    }


    // 挂断功能
    hangup() {
      this.clearError();
      if (this.session) {
        this.session.terminate();
        this.session = null;
        this.setStatus('serviceStatus', 'idle');
      }
    }
    //保持当前通话
    holdCall() {
      this.clearError();
      if (!this.session) {
        this.setError('没有活跃的通话');
        return;
      }
    
      try {
        this.session.hold()
        this.setStatus('serviceStatus', 'hold');
        this.options.eventHandle.onWebPhoneHandle('call.hold');
      } catch (error) {
        console.error('保持通话异常:', error);
        this.setError('保持通话异常: ' + error.message);
      }
    }

    //恢复被保持的通话
    unholdCall() {
      this.clearError();
      if (!this.session) {
        this.setError('没有活跃的通话');
        return;
      }
    
      try {
        this.session.unhold();
        this.setStatus('serviceStatus', 'busy');
        this.options.eventHandle.onWebPhoneHandle('call.unhold');
      } catch (error) {
        console.error('恢复通话异常:', error);
        this.setError('恢复通话异常: ' + error.message);
      }
    }
    // 退签功能
    signOut() {
      this.clearError();
      if (!this.ua) {
        this.setError('SIP未初始化，无法退签');
        return;
      }
    
      try {
        // 如果有活跃的通话，先挂断
        if (this.session) {
          this.hangup();
        }
    
        // 停止SIP UA并注销
        if (this.ua) {
          this.ua.stop();
          // 停止SIP UA并断开WebSocket连接
          if(this.ua.isConnected()){
            this.ua.transport.disconnect();
          }
          this.ua.removeAllListeners();
        }
        
        // 重置状态
        this.setStatus('workStatus', 'offline');
        this.setStatus('serviceStatus', 'idle');
        this.setStatus('sipStatus', 'unreg');
        this.status.signedIn = false;
        // 清除引用
        this.ua = null;
        this.session = null;
        
        // 触发事件
        this.options.eventHandle.onWebPhoneHandle('user.signout');
        console.log('退签成功');
      } catch (error) {
        this.setError('退签失败: ' + error.message);
        console.error('退签失败:', error);
      }
    }
    //转接
    transSo() {
      this.clearError();
      // 如果没有传入目标号码，则从输入框获取
      const number = this.ui?.numberInput.value.trim();
        
      if (!this.session) {
        this.setError('没有活跃的通话可转接');
        return;
      }
    
      if (!number) {
        this.setError('请输入转外线号码');
        return;
      }
    
      const tranNumber = number
      try {
        const domain = this.ua.configuration.uri.host || window.location.hostname;
        const targetUri = `sip:${tranNumber}@${domain}`;

        console.log('Attempting refer to:', targetUri);
      
        // 使用 refer 方法代替 transfer
        this.session.refer(targetUri, { 
          eventHandlers: {
            succeeded: (response) => {
              console.log('转接成功', response);
              this.options.eventHandle.onWebPhoneHandle('externalTransfer.success', response);
            },
            failed: (cause) => {
              console.error('转接失败', cause);
              this.setError(`转接失败: ${cause}`);
              this.options.eventHandle.onWebPhoneHandle('externalTransfer.error', cause);
            }
          }
        });

      } catch (error) {
        console.error('转外线异常:', error);
        this.setError('转外线异常: ', error);
        this.options.eventHandle.onWebPhoneHandle('externalTransfer.error', error);
      }
     }

     // 接听来电
    answer() {
      this.clearError();
      
      if (!this.session) {
        this.setError('没有来电可以接听');
        return;
      }
      
      if (this.session.direction !== 'incoming') {
        this.setError('当前会话不是来电');
        return;
      }
      
      try {
        // 接听电话
        this.session.answer({
          mediaConstraints: { audio: true, video: false },
        });
        
        this.setStatus('serviceStatus', 'calling');
        this.setStatus('workStatus', 'busy');
        this.options.eventHandle.onWebPhoneHandle('incoming.answered');
      } catch (error) {
        this.setError('接听失败: ' + error.message);
        console.error('接听失败:', error);
      }
    }

    //空闲
    setId() {
      this.clearError();
      try {
        // 如果当前有通话，不能直接设置为空闲
        if (this.session) {
          this.setError('请先结束当前通话');
          return;
        }
      
        // 如果SIP未注册，不能设置为空闲
        if (!this.ua || this.status.sipStatus !== 'registered') {
          this.setError('SIP未注册，无法设置为空闲');
          return;
        }
      
        // 设置工作状态为在线，服务状态为空闲
        this.setStatus('workStatus', 'online');
        this.setStatus('serviceStatus', 'idle');

        this.ua.register?.()
        // 触发事件
        this.options.eventHandle.onWebPhoneHandle('status.idle');
        console.log('已设置为空闲状态');

      } catch (error) {
        this.setError('设置空闲状态失败: ' + error.message);
        console.error('设置空闲状态失败:', error);
      }
    }
    //置忙  可以外呼不能呼入
    setBu(isRegister = false) {
      this.clearError();
      try {
        // 如果SIP未注册，不能设置为忙碌
        if (!this.ua || this.status.sipStatus !== 'registered') {
          this.setError('SIP未注册，无法设置为忙碌');
          return;
        }
    
        // 设置工作状态为忙碌
        if(!isRegister){
          this.setStatus('workStatus', 'busy');
        }
        
        // 如果有通话中，服务状态保持为busy
        if (!this.session) {
          this.setStatus('serviceStatus', 'idle');
        }

        // 触发事件
        this.options.eventHandle.onWebPhoneHandle('status.busy');
        console.log('已设置为忙碌状态');
        
      } catch (error) {
        this.setError('设置忙碌状态失败: ' + error.message);
        console.error('设置忙碌状态失败:', error);
      }
    }

    //休息
    setRe() {
      this.clearError();
      try {
        // 如果SIP未注册，不能设置为休息
        if (!this.ua || this.status.sipStatus !== 'registered') {
          this.setError('SIP未注册，无法设置为休息');
          return;
        }
    
        // 设置工作状态为休息
        this.setStatus('workStatus', 'reset');
        
        // 如果有通话中，服务状态保持为busy
        if (!this.session) {
          this.setStatus('serviceStatus', 'idle');
        }

        this.session?.unregister?.();
        // 设置 UA 的接收模式为拒绝
        // this.ua.configuration.receiveIncomingCalls = false;
        // 触发事件
        this.options.eventHandle.onWebPhoneHandle('status.reset');
        console.log('已设置为休息状态');
        
      } catch (error) {
        this.setError('设置休息状态失败: ' + error.message);
        console.error('设置休息状态失败:', error);
      }
    }
    /**
     * 签入 - 从页面输入框读取 SIP 配置并登录
     */
    signIn() {
      this.clearError();
      try {
        // 已注册则无需重复签入
        if (this.ua && this.status.sipStatus === 'registered') {
          this.setError('已处于签入状态');
          return;
        }
        const config = this.getLoginConfigFromUI();
        const err = this._validateSignInConfig(config);
        if (err) {
          this.setError(err);
          return;
        }
        this.login(config);
      } catch (error) {
        this.setError('签入失败: ' + error.message);
        this.status.signedIn = false;
      }
    }

    /**
     * 校验签入必填信息，返回错误文案或 null
     */
    _validateSignInConfig(config) {
      const { url, username, password, wssPort, turnPort } = config;
      if (!url || !url.trim()) return '请填写 SIP 服务器地址';
      if (!username || !username.trim()) return '请填写用户名 / 分机号';
      if (!password || !password.trim()) return '请填写密码';
      const ws = parseInt(wssPort, 10);
      if (isNaN(ws) || ws < 1 || ws > 65535) return 'WSS 端口需为 1–65535 的数字';
      const tp = parseInt(turnPort, 10);
      if (isNaN(tp) || tp < 1 || tp > 65535) return 'STUN 端口需为 1–65535 的数字';
      return null;
    }

    // 设置状态
    setStatus(type, value) {
      this.status[type] = value;
      this.updateUIStatus();
      this.options.eventHandle.onStatusChange(
        this.status.workStatus,
        this.status.serviceStatus,
        this.status.signedIn,
        this.status.sipStatus
      );
    }

    // 更新UI状态显示
    updateUIStatus() {
      // 工作状态
      if(this.ui.workStatus){
        this.ui.workStatus.textContent = this.getStatusText('work', this.status.workStatus);
        this.ui.workStatus.className = `ccbar_status ccbar_work_status_${this.status.workStatus}`;
      }
      // 服务状态
      if(this.ui.serStatus){
        this.ui.serStatus.textContent = this.getStatusText('serv', this.status.serviceStatus);
        this.ui.serStatus.className = `ccbar_status ccbar_serv_status_${this.status.serviceStatus}`;
      }
      // SIP状态
      if(this.ui.sipStatus){  
        this.ui.sipStatus.textContent = this.getStatusText('sip', this.status.sipStatus);
        this.ui.sipStatus.className = `ccbar_status ccbar_sip_status_${this.status.sipStatus === 'registered' ? 'reg' : 'unreg'}`;
      }
    }
  
    // 获取状态文本
    getStatusText(type, status) {
      const texts = {
        work: {
          offline: '离线',
          online: '在线',
          busy: '忙碌',
          reset: '休息'
        },
        serv: {
          idle: '空闲',
          busy: '振铃中',
          calling: '呼出中',
          hold: '保持中'
        },
        sip: {
          unreg: '未注册',
          connecting: '连接中',
          connected: '已连接',
          registered: '已注册',
          unregistered: '未注册',
          failed: '注册失败',
          error: '错误'
        }
      };
      return texts[type][status] || status;
    }
  
    // 设置错误/提示信息 - 以弹窗形式展示
    setError(message) {
      if (message && typeof window.showCcbarToast === 'function') {
        window.showCcbarToast(message);
      } else if (this.ui?.errorInfo) {
        this.ui.errorInfo.textContent = message;
      }
      this.options.eventHandle.onError(message);
    }
  
    // 清除错误信息
    clearError() {
      if(this.ui?.errorInfo){
        this.ui.errorInfo.textContent = '';
      }
    }
}
  
  // 暴露到全局
  window.CCBarSDK = CCBar;