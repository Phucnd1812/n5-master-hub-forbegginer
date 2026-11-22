// These are closed prompts. The accepted spellings describe the same requested
// construction. Free responses use model answers through the lesson examples.
export const APPLY = {
  obligation:{kind:'input', prompt:'Chia 飲む sang nghĩa vụ thể thường. Viết cả cụm với ～なければならない.',
    answers:['飲まなければならない','のまなければならない'], why:'飲む → 飲まない → 飲まなければ + ならない.'},
  'g11b_4':{kind:'input', prompt:'Chia 飲む sang nghĩa vụ lịch sự, dùng ～なければなりません.',
    answers:['飲まなければなりません','のまなければなりません'], why:'Đổi む sang ま, tạo phủ định rồi đổi ない thành なければ. Gắn なりません để nói lịch sự.'},
  nai:{kind:'input', prompt:'Viết thể thường phủ định của 買う.',
    answers:['買わない','かわない'], why:'Động từ nhóm I có đuôi う dùng わ trước ない.'},
  'adj-i':{kind:'input', prompt:'Viết dạng quá khứ phủ định thể thường của 高い.',
    answers:['高くなかった','たかくなかった'], why:'Bỏ い, thêm くない rồi đổi ない thành なかった.'},
  'adj-na':{kind:'input', prompt:'Viết tính từ 静か khi đứng ngay trước danh từ. Điền cả tính từ và phần nối.',
    answers:['静かな','しずかな'], why:'Aな đứng trước danh từ qua な.'},
  'negative-request':{kind:'input', prompt:'Viết “xin đừng uống” theo mẫu ～ないでください.',
    answers:['飲まないでください','のまないでください'], why:'飲む → 飲まない rồi giữ ない trước でください.'},
  optional:{kind:'input', prompt:'Viết “không cần uống” thể thường bằng ～なくてもいい.',
    answers:['飲まなくてもいい','のまなくてもいい'], why:'飲まない → 飲まなくて + もいい.'},
  simultaneous:{kind:'input', prompt:'Điền đúng phần trống để nói hai việc diễn ra đồng thời. 音楽を聞き＿勉強します。',
    answers:['ながら'], why:'ながら đứng sau thân 聞き để nêu việc nền.'},
  'te-kara':{kind:'sort', prompt:'Xếp các cụm thành câu bắt đầu bằng 手を và nêu rửa tay trước khi ăn.',
    answers:['手を','洗ってから','ご飯を','食べます。'], why:'手を gắn với 洗う. 洗ってから đặt việc rửa trước. ご飯を gắn với 食べます.'},
  'g12a_2':{kind:'sort', prompt:'Xếp lại câu, bắt đầu bằng 水を. Uống nước trước, rồi uống thuốc.',
    answers:['水を','飲んでから、','薬を','飲みます。'], why:'飲んで là thể て của 飲む. から giữ thứ tự nước trước, thuốc sau.'},
};

export function normalizeExercise(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s/g,'').replace(/[。.!?！？]$/,'');
}

export function checkPractice(exercise,value) {
  const entered = normalizeExercise(value);
  if (!entered) return null;
  return exercise.answers.some(answer => normalizeExercise(answer) === entered);
}

// Reasons follow the order of incorrect options in the inherited guide exercises.
export const GUIDE_DISTRACTORS = {
  masu:['飲まない là phủ định hiện tại/thói quen ở thể thường.','飲みました là khẳng định quá khứ lịch sự.'],
  nai:['買い là thân trước ます, không phải thân phủ định.','Âm う cuối của nhóm I chuyển thành わ trước ない.'],
  te:['いて đi với nhiều động từ đuôi く; 泳ぐ kết thúc bằng ぐ.','って dùng với nhiều động từ đuôi う, つ, る.'],
  ta:['読み là thân trước ます; 読む dùng んだ cho thể た.','読んで là thể nối, sau đó đổi で thành だ.'],
  potential:['見させる là thể sai khiến, nghĩa là cho hoặc bắt xem.','見れる gặp trong hội thoại rút ら. Câu hỏi chọn dạng chuẩn 見られる.'],
  volitional:['食べた là quá khứ thể thường.','食べられる có thể là khả năng hoặc bị động, tùy ngữ cảnh.'],
  ba:['読ま là thân hàng あ. 読まば có dạng cổ, ngoài mẫu ～ば hiện đại đang học.','読み là thân trước ます, không dùng để tạo ～ば từ 読む.'],
  tara:['飲み là thân trước ます. ～たら cần dạng quá khứ thường.','飲んで là thể nối; ～たら cần 飲んだ trước ら.'],
  imperative:['来る là thể từ điển.','来よう là thể ý chí, có thể là lời rủ hoặc quyết định.'],
  passive:['呼べる là thể khả năng.','呼ばせる là thể sai khiến.'],
  causative:['食べられない có thể là khả năng phủ định hoặc bị động phủ định.','食べない chỉ phủ định việc ăn, chưa có nghĩa sai khiến.'],
  'causative-passive':['食べさせる chỉ sai khiến, chưa nói ai chịu sự sai khiến.','食べられる có thể là bị động hoặc khả năng, thiếu bước tạo sai khiến.'],
  'adj-i':['いい dùng thân よ khi chia. Đuôi này cũng chưa biểu thị quá khứ.','よかった là quá khứ khẳng định, không có phủ định くなかった.'],
  'adj-na':['Cụm tính từ な trước 部屋 cần な.','の thường nối hai danh từ. きれい trong câu này là tính từ な.'],
  obligation:['行かなくてもいい cho phép không đi.','行ってはいけない nói không được đi.'],
  'te-kara':['洗うから có thể nêu lý do, chưa dùng thể て theo yêu cầu.','洗ったから có thể nêu lý do sau khi đã rửa. ～てから đặt rửa trước ăn.'],
  experience:['飲むことがある có thể nói đôi khi uống. Kinh nghiệm cần 飲んだ.','飲んで là thể nối. Mẫu kinh nghiệm dùng thể た.'],
  prohibition:['飲まなければならない bắt buộc phải uống.','飲まなくてもいい cho phép không uống.'],
  desire:['Thể từ điển する không đứng trực tiếp trước たい.','してたい trong hội thoại có thể rút từ していたい, nghĩa muốn tiếp tục học. Mẫu đang luyện gắn たい trực tiếp vào thân し.'],
  progressive:['Yêu cầu mở cửa dùng 窓を開けてください, khác lời miêu tả.','Kinh nghiệm mở cửa dùng dạng như 開けたことがあります.'],
  permission:['Câu này hỏi lại điều cấm hoặc xin phép gián tiếp. ～てもいいですか là lời xin phép trực tiếp được yêu cầu ở đây.','撮ってください yêu cầu người kia chụp.'],
  request:['読み là thân trước ます. Mẫu yêu cầu đang luyện cần 読んで.','読んだ là thể quá khứ thường. ～てください cần 読んで.'],
  'negative-request':['忘れてください yêu cầu hãy quên.','Mẫu yêu cầu phủ định này giữ ない rồi thêm でください.'],
  optional:['待ってはいけない cấm đợi.','待たなければならない bắt buộc phải đợi.'],
  topic:['を thường đánh dấu tân ngữ. 学生です là vị ngữ danh từ.','の cần danh từ sau để nói “sinh viên của tôi” trong cách dùng này, không đánh dấu chủ đề.'],
  subject:['で dùng cho nơi, phương tiện hoặc phạm vi, không chọn đối tượng của 好き trong mẫu này.','と có thể nối danh từ hoặc nêu người đi cùng, không đánh dấu đối tượng sở thích ở đây.'],
  object:['に thường nói điểm tới, thời gian hoặc đối tượng gián tiếp. 水 là vật trực tiếp được uống.','と nêu người đi cùng hoặc nối danh từ trong mẫu sơ cấp.'],
  'particle-ni':['を đánh dấu đối tượng hoặc đường đi, không chỉ vị trí tồn tại ở đây.','で thường nêu nơi hành động, trong khi います chỉ sự hiện diện.'],
  'particle-de':['を đánh dấu tân ngữ hoặc đường di chuyển. バス là phương tiện.','が nêu chủ thể hoặc đối tượng của một số vị ngữ. Xe buýt ở đây là phương tiện.'],
  'particle-e':['he là cách đọc kana へ ngoài vai trò trợ từ trong cách phiên âm thông thường.','ni là cách đọc của に.'],
  'particle-to':['学校へ nêu hướng hoặc đích chuyển động, không phải 友達と.','Câu không cung cấp mốc thời gian. 友達と chỉ người đi cùng.'],
  'particle-no':['学校 chỉ cơ sở mà giáo viên gắn với, bổ nghĩa cho 先生.','の là trợ từ nối, không phải danh từ chính.'],
  'particle-mo':['ここから nghĩa “từ đây”, không nêu địa điểm cũng có.','ここを đánh dấu ここ theo vai trò khác, không mang nghĩa “cũng”.'],
  'particle-kara':['Trường làm mốc cuối khi đi với まで.','Động từ không phải mốc bắt đầu của cụm danh từ này.'],
};
