const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function accountGate(bootstrap){
 return bootstrap?.account?.registration_required===true&&!bootstrap?.profile;
}

export function accountFormHTML({mode='register',profile=null,login=''}={}){
 const signingIn=mode==='login',claim=mode==='claim';
 const icon=kind=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${kind==='user'?'M8 2h8v8H8zM5 13h14v9H5z':kind==='eye'?'M2 9h4V6h12v3h4v6h-4v3H6v-3H2zm8 0v6h4V9z':'M7 2h10v8h4v12H3V10h4zm3 3v5h4V5z'}" fill="currentColor"/></svg>`;
 const passwordField=(name,label)=>`<label class="source-field">${label}<span class="source-input-wrap"><span class="source-field-icon">${icon('lock')}</span><input id="account-${name}" name="${name}" type="password" autocomplete="${signingIn?'current-password':'new-password'}" minlength="8" maxlength="128" required placeholder="${name==='password'?'Пароль':'Ещё раз пароль'}"><button class="source-eye" type="button" data-action="account-password" data-input="account-${name}" aria-label="Показать пароль" aria-controls="account-${name}" aria-pressed="false">${icon('eye')}</button></span></label>`;
 return `<section class="source-entry source-auth"><div class="source-entry-backdrop" aria-hidden="true"></div><div class="source-auth-layout"><div class="account-copy source-welcome"><h1>БЗИКЕР</h1><img src="/assets/design-ui-mascot.png" alt="Маскот Бзик со скрещёнными руками"><p>${claim?`Сохраните вход для персонажа <strong>${escape(profile?.name)}</strong>.`:'Добро пожаловать в город идей'}</p></div><form id="account-form" class="panel account-form source-form" data-mode="${escape(mode)}">${claim?'':`<nav class="source-form-tabs" aria-label="Вход или регистрация"><button type="button" data-action="account-screen" data-mode="login" aria-pressed="${signingIn}">Вход</button><button type="button" data-action="account-screen" data-mode="register" aria-pressed="${!signingIn}">Регистрация</button></nav>`}<h2>${claim?'Сохранить вход':signingIn?'Вход в игру':'Регистрация'}</h2><p class="source-form-subtitle">${claim?'Привяжите данные к вашему персонажу':'Логин сохраняет ваш игровой прогресс'}</p><label class="source-field">Логин<span class="source-input-wrap"><span class="source-field-icon">${icon('user')}</span><input name="login" autocomplete="username" inputmode="text" autocapitalize="none" spellcheck="false" minlength="3" maxlength="32" pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}" required value="${escape(login)}" placeholder="Имя для входа"></span></label>${signingIn?'':'<p class="field-hint">3–32 латинских символа. Игровой ник выберете отдельно.</p>'}${passwordField('password','Пароль')}${signingIn?'':'<p class="field-hint">От 8 символов.</p>'+passwordField('confirm_password','Повтор пароля')}<p id="account-error" class="form-error" role="alert" hidden></p><button class="primary wide" type="submit">${claim?'Сохранить данные входа':signingIn?'Войти в игру':'Создать аккаунт'} →</button><div class="source-form-switch"><span>${signingIn?'Первый раз здесь?':'Уже есть аккаунт?'}</span><button class="quiet" type="button" data-action="account-screen" data-mode="${signingIn?'register':'login'}">${signingIn?'Создать аккаунт':'Войти'}</button></div>${claim?'<button class="quiet wide" type="button" data-action="home">Позже</button>':''}</form></div></section>`;
}

export function accountCredentials(data,mode){
 const login=String(data.login??'').trim().toLowerCase(),password=String(data.password??'');
 if(!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(login))throw new Error('Проверьте логин: 3–32 символа, начиная с латинской буквы или цифры.');
 if(password.length<8||password.length>128)throw new Error('Пароль должен содержать от 8 до 128 символов.');
 if(mode!=='login'&&password!==data.confirm_password)throw new Error('Пароли не совпадают.');
 return {login,password};
}

export function accountSettingsHTML(account,profile){
 if(account?.has_credentials)return `<section class="settings-account"><h3>Ваш аккаунт</h3><p><strong>${escape(account.login)}</strong><br><span class="hint">Персонаж: ${escape(profile?.name)}</span></p><button type="button" data-action="account-logout">Выйти из аккаунта</button></section>`;
 if(profile)return `<section class="settings-account"><h3>Сохранить вход</h3><p class="hint">Привяжите логин и пароль к текущему персонажу, чтобы входить с другого устройства.</p><button type="button" data-action="account-screen" data-mode="claim">Привязать логин и пароль</button></section>`;
 return '';
}
