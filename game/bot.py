"""Optional Telegram launcher. Importing this module performs no network requests."""
import json
import os
import re
import time
from urllib.parse import urlencode,urlsplit,urlunsplit
from urllib.request import Request,urlopen


def invite_url(public_url,invite=''):
    try: url=urlsplit(public_url)
    except ValueError: raise ValueError('PUBLIC_URL must be HTTPS') from None
    if (url.scheme!='https' or not url.hostname or url.username or url.password
            or url.query or url.fragment or any(c.isspace() for c in public_url)):
        raise ValueError('PUBLIC_URL must be HTTPS without credentials, query or fragment')
    if invite and not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',invite): raise ValueError('Invalid invite')
    return urlunsplit((url.scheme,url.netloc,url.path,urlencode({'invite':invite}) if invite else '', ''))


def start_message(update):
    if not isinstance(update,dict): return None
    message=update.get('message')
    if not isinstance(message,dict): return None
    text=message.get('text','')
    chat=message.get('chat',{})
    if not isinstance(text,str) or not isinstance(chat,dict) or type(chat.get('id')) is not int: return None
    match=re.fullmatch(r'/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]{1,100}))?\s*',text)
    return (chat['id'],match.group(1) or '') if match else None


def telegram_call(bot_token,method,data):
    request=Request(f'https://api.telegram.org/bot{bot_token}/{method}',
                    json.dumps(data).encode(),{'Content-Type':'application/json'},method='POST')
    with urlopen(request,timeout=45) as response:
        result=json.load(response)
    if not result.get('ok'): raise RuntimeError('Telegram request failed')
    return result['result']


def main():
    bot_token=os.environ.get('BOT_TOKEN','')
    public_url=os.environ.get('PUBLIC_URL','')
    if not bot_token: raise SystemExit('BOT_TOKEN is required')
    try: invite_url(public_url)
    except ValueError: raise SystemExit('PUBLIC_URL must use HTTPS') from None
    offset=0
    print('Бзикер: ожидание /start')
    try:
        while True:
            try:
                updates=telegram_call(bot_token,'getUpdates',{'offset':offset,'timeout':30,'allowed_updates':['message']})
                for update in updates:
                    if not isinstance(update,dict) or type(update.get('update_id')) is not int: continue
                    start=start_message(update)
                    if start:
                        chat_id,invite=start
                        telegram_call(bot_token,'sendMessage',{'chat_id':chat_id,'text':'Открыть Бзикер',
                            'reply_markup':{'inline_keyboard':[[{'text':'Играть в Бзикер','web_app':{'url':invite_url(public_url,invite)}}]]}})
                    offset=update['update_id']+1
            except Exception:
                # Network exception strings may contain the bot token: never print them.
                print('Telegram временно недоступен; повтор через 5 секунд')
                time.sleep(5)
    except KeyboardInterrupt: pass


if __name__=='__main__': main()
