

const token = '8947609412:AAFxEHDJAikSrCd6a_pd279oYGjdfsxVOOM';
const chatId = '111111111'; // dummy id, will return "chat not found" if format is good
const esc = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');

let telegramMessage = `📦 *Automated Delivery for ${esc('Product-Name!')}*\n\n`;
telegramMessage += `📝 ${esc('admin message with - and .')}\n\n`;
const safeLink = 'https://google.com?q=test-url-with-hyphens.and.dots'.replace(/([\\()])/g, "\\$1");
telegramMessage += `🗺️ *Location:* [View on Map](${safeLink})\n`;
telegramMessage += `\nStatus: *READY FOR PICKUP*`;

console.log(telegramMessage);

async function test() {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: telegramMessage,
      parse_mode: 'MarkdownV2',
    })
  });
  console.log(res.status, await res.text());
}
test();
