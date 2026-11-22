import {validOutput,validRequest} from './protocol.js';

export const MODES = {offline:'Ngoại tuyến',request:'Theo yêu cầu',auto:'Tự động thông minh'};
const MODE_KEY = 'n5_translation_mode_v1';
export function getMode() {
  try {
    const mode=localStorage.getItem(MODE_KEY);
    if (Object.hasOwn(MODES,mode)) return mode;
  } catch { /* Storage is optional for translation. */ }
  return 'request';
}

export function setMode(mode) {
  if (!Object.hasOwn(MODES,mode)) return false;
  try { localStorage.setItem(MODE_KEY,mode); return true; } catch { return false; }
}

export const messages = {
  offline:'Không có kết nối Internet.',unauthorized:'Đăng nhập trong Sao lưu & khôi phục để dùng Gemini.',
  forbidden:'Tài khoản này chưa được cấp quyền dịch AI.',unconfigured:'Chưa kết nối Gemini.',
  quota:'Đã chạm giới hạn lượt gọi. Thử lại sau.',duplicate:'Câu này vừa được gửi. Hãy chờ rồi thử lại.',
  timeout:'Dịch vụ phản hồi quá chậm. Hãy thử lại.',unavailable:'Dịch vụ dịch tạm thời không khả dụng.',
  invalid_output:'Gemini trả về kết quả sai định dạng. Hãy thử lại.',bad_request:'Hãy nhập câu dài từ 2 đến 320 ký tự.',
};

export async function requestTranslation(input,send,signal) {
  const payload=validRequest(input);
  if (!payload) return {error:'bad_request'};
  if (globalThis.navigator?.onLine===false) return {error:'offline'};
  try {
    const response=await send(payload,signal);
    if (!response.ok) {
      const reply=await response.json().catch(()=>null);
      const defaults={400:'bad_request',401:'unauthorized',403:'forbidden',404:'unconfigured',
        408:'timeout',429:'quota',504:'timeout',546:'timeout'};
      return {error:Object.hasOwn(messages,reply?.error) ? reply.error : defaults[response.status] || 'unavailable'};
    }
    const reply=await response.json().catch(()=>null);
    const valid=validOutput(reply,payload.direction);
    if (!valid || reply.originalText!==payload.text || typeof reply.model!=='string' || reply.model.length>80) {
      return {error:'invalid_output'};
    }
    return {result:{...valid,source:'ai',version:reply.model}};
  } catch (error) {
    if (signal.aborted) return {error:'aborted'};
    const code=error?.code;
    return {error:Object.hasOwn(messages,code) ? code : 'unavailable'};
  }
}
