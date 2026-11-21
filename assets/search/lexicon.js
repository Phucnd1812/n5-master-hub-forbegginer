export const EXTRA_WORDS = [
  ['五等分','ごとうぶん','chia thành năm phần bằng nhau','Danh từ / danh động từ'],
  ['等分','とうぶん','chia đều thành các phần bằng nhau','Danh từ / danh động từ'],
  ['五分','ごふん','năm phút','Số đếm thời gian'],
  ['五分','ごぶ','một nửa; ngang bằng (tùy ngữ cảnh)','Danh từ'],
  ['分','ぶん','phần; lượng tương ứng','Danh từ / hậu tố'],
  ['ごと','ごと','mỗi; cứ mỗi (thường viết ごと)','Hậu tố'],
  ['日本語','にほんご','tiếng Nhật','Danh từ'],
  ['仕事','しごと','công việc','Danh từ'],
  ['好き','すき','thích; yêu thích','Tính từ な'],
  ['明日','あした','ngày mai','Danh từ'],
  ['行く','いく','đi','Động từ'],
  ['飲む','のむ','uống','Động từ'],
  ['終わる','おわる','kết thúc','Động từ'],
  ['呼ぶ','よぶ','gọi; mời','Động từ']
];
export const CURATED_SENTENCES = [
  ['日本語が好きです','にほんごがすきです','Tôi thích tiếng Nhật.'],
  ['明日仕事に行かなければならない','あしたしごとにいかなければならない','Ngày mai (tôi) phải đi làm.'],
  ['水を飲んでから','みずをのんでから','Sau khi uống nước…'],
  ['飲んでから','のんでから','Sau khi uống…'],
  ['ご飯を食べます','ごはんをたべます','(Tôi) ăn cơm.'],
  ['明日学校へ行きます','あしたがっこうへいきます','Ngày mai (tôi) đi đến trường.'],
  ['毎日日本語を勉強します','まいにちにほんごをべんきょうします','(Tôi) học tiếng Nhật mỗi ngày.'],
  ['私は学生です','わたしはがくせいです','Tôi là học sinh/sinh viên.'],
  ['五等分','ごとうぶん','Chia thành năm phần bằng nhau.'],
  ['昨日、友達と映画を見てから、ご飯を食べました。','きのう、ともだちとえいがをみてから、ごはんをたべました。','Hôm qua, sau khi xem phim với bạn, tôi đã ăn cơm.']
];

// The first reading is what the learner sees. Extra spellings allow common
// keyboard input such as "wo", while pronunciation uses o, wa and e.
export const FUNCTION_WORDS = [
  ['は','wa','topic','Nêu chủ đề hoặc đối chiếu.',['ha']],
  ['が','ga','subject','Đánh dấu chủ thể hoặc đối tượng của một số vị ngữ.'],
  ['を','o','object','Đánh dấu tân ngữ hoặc đường đi.',['wo']],
  ['に','ni','particle-ni','Chỉ đích đến, thời điểm, nơi tồn tại hoặc đối tượng.'],
  ['へ','e','particle-e','Chỉ hướng.',['he']],
  ['で','de','particle-de','Chỉ nơi hành động, phương tiện hoặc phạm vi.'],
  ['と','to','particle-to','Cùng với, liệt kê, trích dẫn hoặc điều kiện.'],
  ['の','no','particle-no','Nối danh từ hoặc danh từ hóa, tùy ngữ cảnh.'],
  ['も','mo','particle-mo','Cũng, thêm vào phạm vi.'],
  ['から','kara','particle-kara','Điểm bắt đầu hoặc nguyên nhân, tùy vế.'],
  ['まで','made','particle-kara','Điểm kết thúc hoặc giới hạn.'],
  ['より','yori','g3d_15','Mốc so sánh hoặc điểm xuất phát.'],
  ['か','ka','g4a_1','Tạo câu hỏi hoặc nêu lựa chọn.'],
  ['ね','ne','g1c_8','Xác nhận hoặc tìm sự đồng tình.'],
  ['よ','yo','g1c_9','Nhấn mạnh hay báo thông tin cho người nghe.'],
  ['けど','kedo','g4b_8','Nối vế có ý đối chiếu.'],
  ['なら','nara','g14c_7','Điều kiện “nếu là” hoặc “nếu nói về”.'],
  ['だけ','dake','g14a_3','Chỉ, giới hạn phạm vi.'],
  ['しか','shika','g14a_2','Chỉ, đi cùng phủ định.'],
  ['や','ya','g6c_12','Liệt kê một số ví dụ.'],
  ['など','nado','g6c_12','Vân vân, chẳng hạn.'],
  ['です','desu','g1a_1','Hệ từ lịch sự phi quá khứ.'],
  ['でした','deshita','g2a_1','Hệ từ lịch sự quá khứ.'],
  ['だ','da','g4a_2','Hệ từ thể thường.'],
  ['ではありません','dewaarimasen','g1b_4','Hệ từ phủ định lịch sự.',['dehaarimasen']],
  ['じゃない','janai','g4a_3_2','Hệ từ phủ định thể thường.'],
  ['そして','soshite','','Nối sự kiện: và rồi.'],
  ['それから','sorekara','','Sau đó.'],
  ['しかし','shikashi','','Nối đối chiếu: tuy nhiên.'],
  ['でも','demo','','Nhưng hoặc ngay cả, tùy chỗ đứng.'],
  ['ので','node','','Lý do: vì, do.'],
  ['について','nitsuite','','Về một chủ đề.'],
  ['ために','tameni','','Chỉ mục đích hoặc nguyên nhân.'],
  ['ながら','nagara','','Hai hành động diễn ra cùng lúc.'],
  ['かもしれない','kamoshirenai','','Nêu khả năng chưa chắc chắn.'],
  ['と思います','toomoimasu','','Đưa ra nhận định.'],
  ['ほうがいい','hougaii','','Đưa ra lời khuyên.'],
  ['つもりです','tsumoridesu','','Nêu dự định.'],
];


export function builtInRows(rows) {
  return rows.map(([jp,readings,vi,pos,romans,aliases]) => ({
    jp, kana:readings[0] || '', readings,vi,pos,romans,aliases,
    source:'Wiktionary / Kaikki · Tích hợp', builtin:true,
  }));
}

// Existing Kaikki/Wiktionary extract, moved out of the app shell unchanged.
let builtin;
export function loadBuiltInDictionary() {
  builtin ??= fetch(new URL('./builtin-dictionary.json',import.meta.url)).then(async response => {
    if (!response.ok) throw new Error('Dictionary file unavailable');
    return builtInRows(await response.json());
  }).catch(error => {
    builtin = null;
    throw error;
  });
  return builtin;
}
