// ไฟล์: netlify/functions/send-to-telegram.js

exports.handler = async (event) => {
  // 1 ตรวจสอบ Method
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // 2 ดึง Environment Variables
  const {
    TELEGRAM_BOT_TOKEN,
    CHAT_ID_PRAYASATJA, // สาขาพระยาสัจจา
    CHAT_ID_BANGSAEN,   // สาขาบางแสน
    TELEGRAM_CHAT_ID    // ห้องกลาง แอดมินรวม
  } = process.env;

  if (!TELEGRAM_BOT_TOKEN || !CHAT_ID_PRAYASATJA || !CHAT_ID_BANGSAEN) {
    return { statusCode: 500, body: "Missing environment variables" };
  }

  // 3 ดึงข้อมูลจาก body
  const data = JSON.parse(event.body || "{}");
  const positionText = data.position || "";

  // 4 เลือกห้องปลายทางตามสาขา
  let targetChatId;
  if (positionText.includes("พระยาสัจจา")) {
    targetChatId = CHAT_ID_PRAYASATJA;
  } else if (positionText.includes("บางแสน")) {
    targetChatId = CHAT_ID_BANGSAEN;
  } else {
    // ถ้าไม่ตรงอะไรเลย ส่งเข้าห้องกลาง หรือถ้าไม่ได้ตั้ง ก็ให้เข้า พระยาสัจจา ไว้ก่อน
    targetChatId = TELEGRAM_CHAT_ID || CHAT_ID_PRAYASATJA;
  }

  // 5 ฟังก์ชัน escape text สำหรับ HTML
  const escape = (str) => {
    if (!str) return "N/A";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  };

  // 6 จัดการประวัติการทำงานตาม workCount (0 1 2 3 4 5 5+)
  let workHistoryText = "N/A (ไม่เคยทำงาน)";
  const rawWorkCount = data.workCount || "";

  let numericCount = 0;
  if (rawWorkCount === "5+") {
    numericCount = 5;
  } else if (rawWorkCount && !Number.isNaN(parseInt(rawWorkCount, 10))) {
    numericCount = parseInt(rawWorkCount, 10);
  }

  if (numericCount > 0) {
    const displayCount = rawWorkCount === "5+" ? "มากกว่า 5" : rawWorkCount;
    workHistoryText = `\n(เคยทำงาน ${escape(displayCount)} ที่)\n`;

    for (let i = 1; i <= numericCount; i++) {
      const workplace = data[`workplace${i}`];
      const position = data[`position${i}`];
      const description = data[`description${i}`];

      // ถ้าไม่มีอะไรกรอกเลยในงานที่ i ให้ข้ามได้
      if (!workplace && !position && !description) {
        continue;
      }

      workHistoryText += `<b>${i}. ${escape(workplace || "ไม่ระบุสถานที่ทำงาน")}</b>\n`;
      workHistoryText += `   <i>ตำแหน่ง</i> ${escape(position || "N/A")}\n`;
      workHistoryText += `   <i>สิ่งที่ทำ</i> ${escape(description || "N/A")}\n`;
    }
  }

  // 7 วันที่พร้อมเริ่มงาน
  const startDate =
    data.start_date_type === "immediate"
      ? "พร้อมเริ่มงานทันที"
      : `วันที่ ${escape(data.specific_start_date) || "ไม่ได้ระบุ"}`;

  // 8 ความพร้อมสาขาพระยาสัจจา
  let prayasatjaAvailabilityText = "N/A";
  if (data.prayasatja_availability) {
    prayasatjaAvailabilityText = escape(data.prayasatja_availability);
  }

  // 9 ประกอบข้อความหลัก
  let text = `<b>🔔 มีใบสมัครงานใหม่</b>\n\n`;
  text += `<b>ตำแหน่ง</b> ${escape(data.position)}\n`;
  text += `<b>ชื่อ นามสกุล</b> ${escape(data.first_name)} ${escape(data.last_name)} (${escape(data.nickname)})\n`;
  text += `<b>อายุ น้ำหนัก ส่วนสูง</b> ${escape(data.age)} ปี / ${escape(data.weight)} กก. / ${escape(data.height)} ซม.\n`;
  text += `<b>ติดต่อ</b> ${escape(data.phone)} (Line ${escape(data.line_id)})\n`;
  text += `<b>การศึกษา</b> ${escape(data.education)}\n`;
  text += `<b>ที่อยู่</b> ${escape(data.address)}\n`;
  text += `<b>พร้อมเริ่มงาน</b> ${startDate}\n`;

  // แสดงเฉพาะเคสสาขาพระยาสัจจาเท่านั้นที่มีคำถามนี้
  if (positionText.includes("พระยาสัจจา")) {
    text += `<b>ความพร้อมสาขาพระยาสัจจา</b> ${prayasatjaAvailabilityText}\n`;
  }

  text += `<b>ประวัติการทำงาน</b> ${workHistoryText}\n\n`;

  if (data.photo_url) {
    text += `<a href="${escape(data.photo_url)}"><b>🔗 ดูรูปถ่ายผู้สมัคร</b></a>`;
  } else {
    text += `<b>🔗 ดูรูปถ่ายผู้สมัคร</b> <i>ไม่มีการแนบไฟล์</i>`;
  }

  // 10 ฟังก์ชันยิงไป Telegram
  const telegramURL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

  const sendTelegram = async (endpoint, payload) => {
    const res = await fetch(`${telegramURL}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Telegram API error ${endpoint} ${res.status} ${res.statusText}`);
    }
  };

  try {
    // ส่งรูปก่อน ถ้ามี
    if (data.photo_url) {
      const caption =
        `ใบสมัครงานจาก <b>${escape(data.first_name)} ${escape(data.last_name)}</b>\n` +
        `ตำแหน่ง <b>${escape(data.position)}</b>`;

      await sendTelegram("sendPhoto", {
        chat_id: targetChatId,
        photo: data.photo_url,
        caption,
        parse_mode: "HTML"
      });
    }

    // ส่งข้อความรายละเอียด
    await sendTelegram("sendMessage", {
      chat_id: targetChatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false
    });

    return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};
