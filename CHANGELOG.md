# Changelog

## v5.53 — Intelligent Dictionary, Hybrid Translation & Native Experience

- Nhận diện Kanji tự động sau khi dừng viết. Phạm vi Thông minh kết hợp kho giáo trình với 6.703 mẫu ngoại tuyến và so khớp cả khi tỷ lệ nét hơi lệch. Giữ phạm vi N5 và nút Nhận diện thủ công.
- Dịch các đoạn có nhiều câu bằng bộ dịch cục bộ và bộ nhớ đã có. Chế độ Tự động thông minh gửi văn bản đủ điều kiện đến Gemini khi bản dịch cục bộ thiếu căn cứ. Hỗ trợ tối đa 3.000 ký tự trong công cụ Dịch với Edge Function được cập nhật.
- Xem nghĩa chính, âm đọc, từ loại và cách chia trong thẻ từ điển. Có thể chọn từ trong câu ví dụ, bài đọc, hội thoại và câu dịch để tra ngay.
- Mở rộng thẻ chi tiết trên mobile bằng thanh nắm, dùng Ctrl+K hoặc ⌘+K để tra cứu và mở công cụ, chỉnh cỡ chữ, khoảng cách dòng, furigana, Romaji và mật độ trong phần Cài đặt.
- Cập nhật PWA và kiểm thử nâng cấp từ v5.52.5. [Kết quả và cách cập nhật Edge Function](docs/v5.53-review.md)

## v5.52.5 — Complete Dictionary & Kanji Expansion

- Mở rộng kho từ JMdict và Kanji KANJIDIC2. Nhóm từ đồng âm có danh sách đầy đủ theo từng lượt, giữ riêng từ gốc và dạng chia. Bổ sung thứ tự nét KanjiVG tải theo nhu cầu, có phát, tạm dừng và phát lại.
- Gõ để xem tối đa ba gợi ý ngay dưới ô tìm kiếm. Enter hoặc **Xem tất cả** mới mở trang kết quả, đưa trang lên đầu và ghi lịch sử. Mở thẻ gợi ý giữ nguyên bài học đang xem.
- Sao chép và dán ruby có cấu trúc bằng phần chữ gốc. Khi văn bản thuần có dấu hiệu trộn furigana, ứng dụng đưa gợi ý và chờ người dùng chọn.
- Dùng Plus Jakarta Sans cho tiêu đề, Be Vietnam Pro cho giao diện và Noto Sans JP cho tiếng Nhật. Font được lưu cùng ứng dụng, giữ chế độ sáng/tối và bố cục Liquid Glass.
- Thêm 78 bộ câu hỏi và cách trả lời trong bài ngữ pháp và cửa sổ tra cứu. Kèm hội thoại, giải thích tiếng Việt và đường dẫn đến trình Kiểm tra câu.
- Cập nhật cache PWA và kiểm tra khả năng giữ dữ liệu học qua nâng cấp. [Báo cáo kiểm kê và kiểm thử](docs/v5.52.5-review.md)

## v5.52.4 — Handwriting Experience & Dictionary Fix

- Mở bảng viết Kanji trong cửa sổ có vùng cuộn riêng. Giữ nút đóng và các nút nhận diện, hoàn tác, làm lại và xóa nét trong tầm nhìn.
- Giữ nét khi thay đổi kích thước. Nếu kho N5 khớp yếu, người dùng có thể thử kho mở rộng. Chọn bất kỳ ứng viên nào để tra trong Universal Search và xem thứ tự nét từ dữ liệu ngoại tuyến khi có.
- Bổ sung 11 mục JMdict có nhóm chia đã xác minh. Phân biệt `着て` và `来て` trong kết quả `kite` hoặc `きて` và dịch các câu trang phục theo danh từ đi kèm.
- Cập nhật cache PWA và bổ sung ca thử cho cuộn, chuột, cảm ứng và nhận diện ngoại tuyến. [Báo cáo kỹ thuật](docs/v5.52.4-review.md)

## v5.52.3 — Universal Search Intelligence & Instant Lookup

- Tra cứu tự động sau 240 ms ở thanh tìm kiếm và cửa sổ tra cứu. Gợi ý ngắn hiện ngay dưới ô nhập, giữ con trỏ và chờ gõ tiếng Nhật xong. Mobile giữ vị trí khi đang gõ. Enter vẫn đưa trang kết quả về đầu.
- Hiển thị nghĩa tiếng Việt, từ gốc và các bước chia ngay trong kết quả. Tách mục từ khớp chính xác khỏi dạng chia, cách viết khác, gợi ý tiền tố và mẫu ngữ pháp liên quan.
- Bổ sung 23 mục JMdict, liên kết cách viết đã xác minh và hỗ trợ hậu tố trên các từ chỉ người phù hợp. Bộ dịch ngoại tuyến xử lý các vị ngữ thời tiết đơn giản.
- Thêm kiểm thử cho gõ nhanh, dán, IME, tra cứu ngoại tuyến và nâng cấp PWA từ v5.52.2. [Báo cáo kỹ thuật](docs/v5.52.3-review.md)

## v5.52.2 — Search Experience & Visual Clarity

- Đưa câu gốc và bản dịch lên đầu, gom thao tác dịch vào một thanh và chia phần kiến thức thành bốn tab giữ trạng thái.
- Gắn nguồn Kana và Romaji, dùng cách đọc Gemini khi bản ngoại tuyến thiếu và câu khớp. Chuyển cách đọc khác về phần đối chiếu.
- Chuẩn hóa bề mặt từ vựng, Kanji, ngữ pháp, chia thể và Kiểm tra câu. Cập nhật PWA và kiểm tra giữ lịch sử dịch đã lưu qua nâng cấp.

## v5.52.1 — Smart Translation Engine

- Thêm dịch Nhật, Kana và Romaji từ câu đối chiếu và quy tắc ngoại tuyến. Giữ chủ ngữ lược và hiển thị nghĩa cụm khi câu chưa đủ căn cứ. Thêm các câu đối chiếu Việt–Nhật trong công cụ Dịch hiện có.
- Thêm tùy chọn dịch chuyên sâu bằng Gemini qua Supabase Edge Function có xác thực, giới hạn lượt gọi và kiểm tra kết quả. Mặc định gọi theo yêu cầu, có chế độ ngoại tuyến và tự động sau khi bật.
- Lưu lịch sử dịch bằng IndexedDB, cho phép đánh dấu, tra lại offline và sao lưu riêng theo lựa chọn. Giữ định dạng sao lưu tiến độ học.

## v5.52 — Ultimate Learning & Experience

- Thêm Luyện đặt câu và Kiểm tra câu trong nhóm Luyện tập, với bài mẫu, tự đối chiếu câu viết tự do và nhận diện lỗi tiếng Nhật theo quy tắc. Lỗi chắc chắn có thể lưu vào Sổ tay và mở bài luyện cùng cấu trúc.
- Nối tra cứu với luyện đúng từ hoặc mẫu đang học. Thêm sơ đồ kiến thức từ vựng và cải thiện liên kết giữa Kanji, ví dụ, ngữ pháp và dạng chia.
- Mỗi lượt tra mới đưa trang kết quả về đầu. Mở một động từ sẽ hiện ngay các thể ます, て, た, ない nếu đã xác định được nhóm. Chọn một thể để xem từng bước chia. Nút Quay lại khôi phục vị trí đang đọc.
- Làm mới Tổng quan, sidebar, thanh tìm kiếm, Flashcard và bề mặt học với Liquid Glass. Thêm bốn chế độ hiệu ứng và tùy chọn sao lưu tương thích ngược. Sửa nhãn phiên bản cũ ở sidebar.
- Tách mẫu nhận dạng và đường nét Kanji khỏi HTML khởi động. Đưa các tài nguyên mới vào cache PWA và chỉ nạp dữ liệu nhận dạng khi cần.

## v5.51 — Japanese Language Intelligence

- Universal Search phân biệt khớp chính xác, tiền tố, gần đúng và suy luận. Tra theo mục đích giao tiếp bằng tiếng Việt, nhận dạng Romaji có khoảng trắng và mở lượt tra tiếp ngay trong cùng cửa sổ.
- Mở rộng dạng phủ định quá khứ, lịch sự, tiếp diễn, sai khiến bị động và nghĩa vụ hội thoại. Hiển thị phần đổi, quy tắc và ý nghĩa từng bước. Thêm 74 mục chọn lọc từ JMdict, có cách đọc, nhóm đã đối chiếu, nghĩa Việt và giấy phép.
- Phân tích cụm, trợ từ, thành phần câu, cách hiểu khác và đường chia thể. Tra từ, Kanji, thứ tự nét có sẵn và ngữ pháp trong cùng cửa sổ. Bản dịch dựa trên câu đối chiếu.
- Chuẩn hóa cách đọc 130 bài chuyên sâu và mở rộng lên 19 bài so sánh có bảng lựa chọn. Thêm đối chiếu về hạn cuối, thứ tự và đồng thời, nối phủ định, sắc thái lịch sự, khả năng và bị động.
- Tổng quan là nút Home độc lập trên desktop và trong menu mobile. Bổ sung kiểm thử bộ gõ tiếng Nhật, lịch sử cửa sổ, tra ngoại tuyến và nâng PWA từ v5.50.

## v5.50 — Grammar Deep Learning

- Mở bài chuyên sâu theo từng ID của cả 130 mẫu giáo trình. Giữ 34 chuyên đề nền, thêm ～ながら và 14 bài so sánh cách dùng.
- Thêm sơ đồ chia thể theo từ trong giáo trình, sơ đồ kiến thức và kho ví dụ có cách đọc, Romaji, giải thích, phát âm và tra từ ngay trong cửa sổ.
- Thêm luyện nhận diện, điền và chia thể, xếp cụm, dịch và đặt câu. Trắc nghiệm giải thích từng lựa chọn. Câu dịch và câu tự đặt dùng đáp án tham khảo. Trắc nghiệm sai lưu vào Sổ tay câu sai.
- Mở rộng Universal Search theo câu ví dụ và mục đích giao tiếp. Tải nội dung bài khi mở, giữ tra cứu và học ngoại tuyến.

## v5.49 — Universal Japanese Search & Grammar Intelligence

- Tra Kana, Kanji, Romaji và nghĩa tiếng Việt trong giáo trình và kho từ điển. Xếp hạng theo mục khớp, tiền tố, lỗi gõ nhẹ và thành phần nhận diện. Thêm bộ lọc và danh sách tra gần đây.
- Nhận diện dạng chia động từ/tính từ và cho xem đường biến đổi, quy tắc, nghĩa của dạng chia và cách hiểu khác. Phân tích câu theo cụm, đánh dấu trợ từ và phần ngoài kho. Hiện bản dịch khi có câu đối chiếu.
- Thêm 34 bài ngữ pháp chuyên sâu về chia thể, trợ từ và mẫu thông dụng. Mỗi bài có ví dụ được giải thích và câu luyện có đáp án. Các mẫu giáo trình còn lại truy cập được qua cùng cửa sổ tra cứu.
- Mở mục từ, Kanji và ngữ pháp ngay trong trang. Có tùy chọn Romaji và Furigana, nghe, thêm Flashcard, đưa từ vào lịch ôn và trở lại vị trí kết quả sau khi mở giáo trình.
- Tách kho từ tích hợp khỏi HTML khởi động. Chạy tìm kiếm trong Web Worker và lưu các module cùng kho từ vào cache PWA. Mở kho IndexedDB đã nhập khi tra hoặc quản lý từ điển.
- Bổ sung kiểm thử Chromium, WebKit và thuật toán. Kiểm tra dữ liệu giáo trình, nhận diện chữ viết tay, Smart Study, sao lưu cũ và Cloud Sync mô phỏng.

## v5.48 — Smart Study & Personalized Learning

- Tạo buổi học theo SRS, câu sai, tiến độ bài và lượt luyện. Mặc định 5 phút với tùy chọn thời lượng, trọng tâm và phương pháp.
- Thêm kế hoạch hằng ngày, học nhanh từ trang chủ, thay hoặc bỏ qua nhiệm vụ và tiếp tục đúng câu hoặc thẻ sau khi mở lại. Tái sử dụng giáo trình, Flashcard, lịch ôn và bài luyện N5 hiện có.
- Lưu chuỗi ngày từ hoạt động học, thời gian làm bài, lịch sử buổi, kết quả và đề xuất ôn sau. Cho phép tắt ghi chi tiết hoặc xóa dữ liệu phân tích độc lập với tiến độ.
- Lưu mô-đun Smart Study vào PWA để học ngoại tuyến. Bổ sung trường Smart Study tùy chọn vào sao lưu và Cloud Sync, kèm chốt khi có buổi dở hoặc thay đổi từ tab khác.
- Thêm kiểm thử Chromium và WebKit cho Smart Study, đồng bộ mô phỏng và dữ liệu cũ.

## v5.47.1

- Hiển thị phiên bản đang chạy ngay dưới tiêu đề **Sao lưu & khôi phục**, kể cả khi học ngoại tuyến hoặc có bản mới đang chờ cập nhật.

## v5.47 — Stability & Performance Update

- Giảm công việc lặp khi tìm kiếm toàn cục, Romaji và dạng chia. Giữ thứ tự và nội dung kết quả trên tập truy vấn hồi quy.
- Mở kết quả sâu trong kho từ vựng theo nhóm, giảm số dòng dựng lúc chuyển trang. Bỏ qua tìm kiếm khi bộ gõ tiếng Nhật đang soạn và giảm ghi vị trí cuộn trùng.
- Giữ bản ngoại tuyến đang chạy khi tải bản mới thất bại. Thêm kiểm tra lại sớm và khôi phục cache bị thu hồi khi có mạng.
- Dừng Cloud Sync khi có dữ liệu mới từ tab khác. Yêu cầu xác nhận lại lựa chọn xung đột nếu bản cloud đã đổi revision. Giữ tương thích với bản sao lưu v5.46.
- Thêm kiểm thử trình duyệt bằng Playwright và GitHub Actions. Ghi kết quả đo, rủi ro còn lại và lộ trình Smart Study trong tài liệu rà soát.

## v5.46

- Thêm manifest, biểu tượng từ logo hiện có và chế độ standalone. Mục **Sao lưu & khôi phục** có hướng dẫn cài đặt trên Safari iPhone và Chrome/Edge Windows.
- Lưu giao diện và nội dung giáo trình vào cache sau lần mở trực tuyến đầu tiên. Từ vựng, Kanji có sẵn, ngữ pháp, Flashcard, SRS, luyện tập và tìm kiếm nội bộ mở được khi mất mạng.
- Biên dịch Tailwind thành CSS tĩnh, lưu Lucide cùng website và tải font web bất đồng bộ để giảm phụ thuộc vào CDN lúc khởi động.
- Tự kiểm tra bản mới khi mở hoặc quay lại ứng dụng và khi có mạng trở lại. Khi tải đủ tài nguyên, người học có thể chọn thời điểm mở lại để cập nhật. Cache cũ của ứng dụng được dọn sau khi bản mới kích hoạt.
- Giữ tiến độ học trong bộ nhớ cục bộ và dùng lại Supabase hiện có. Tự động đồng bộ khi ứng dụng mở hoặc trở lại trực tuyến nếu đã bật. Các bản sao lưu từ v5.45 vẫn dùng được.
- Phát âm ngoại tuyến ưu tiên giọng cục bộ nếu có. Dịch online, tra cứu ngoài giáo trình và đồng bộ đám mây cần Internet.
