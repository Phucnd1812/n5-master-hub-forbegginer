# N5 Master Hub

Ứng dụng học JLPT N5 cá nhân bằng tiếng Việt, ưu tiên Safari trên iPhone và Chrome/Edge trên Windows. GitHub Pages xuất bản từ `main` tại thư mục gốc của repository. Dùng đường dẫn tương đối để ứng dụng, manifest và service worker hoạt động dưới `/n5-master-hub-forbegginer/` và trên máy phát triển.

## Kiến trúc

- `index.html` chứa giao diện Liquid Glass, các kho dữ liệu giáo trình và logic học. Giữ bố cục sidebar trên PC, điều hướng dưới trên mobile, chế độ sáng/tối/tự động và khoảng đệm safe area của iOS. Ưu tiên sửa đúng khu vực liên quan và tránh viết lại toàn bộ.
- `assets/ui/premium.css` giữ token và bề mặt Liquid Glass. `assets/ui/effects.js` áp dụng tùy chọn hiệu ứng, kiểu nhập và reduced motion. Chỉ nghiêng thẻ đã chọn bằng chuột. Giữ phần lật Flashcard độc lập. Hiệu ứng bám theo viewport và ưu tiên transform hoặc opacity.
- `manifest.webmanifest` khai báo URL khởi động, phạm vi, chế độ standalone và biểu tượng. Giữ `id` và `start_url` ổn định để bản mới tiếp tục dùng danh tính ứng dụng đã cài.
- `sw.js` lưu HTML và danh sách tài nguyên tĩnh công khai theo phiên bản và phạm vi website. Cập nhật tải đủ tài nguyên trước khi kích hoạt, rồi dọn cache cũ của chính ứng dụng. `pwa.js` hiển thị trạng thái, hỗ trợ cài đặt và xin xác nhận trước khi mở lại phiên học.
- Tailwind CSS 3.4.17 được biên dịch tĩnh từ `index.html` và `assets/smart-study.js` và commit vào `assets/tailwind.css`. Giữ tên đầy đủ của utility class trong template hoặc khai báo safelist khi tạo tên động. Khi thay đổi class hoặc cấu hình, chạy lệnh sau từ thư mục gốc.

  ```sh
  npx --yes tailwindcss@3.4.17 -c tools/tailwind.config.cjs -i tools/tailwind.css -o assets/tailwind.css --minify
  ```

- Smart Study dùng `assets/study-engine.js` cho đề xuất và biểu diễn dữ liệu, `assets/smart-study.js` cho màn hình và phiên học. Cả hai phải được đưa vào cache theo phiên bản. Giữ các ID giáo trình và ưu tiên dùng trình chấm sẵn có.
- Universal Search ở `assets/search/`. `search-engine.js` xếp hạng theo mức khớp, `morphology.js` tạo dạng chia từ nhóm đã xác định, `sentence-analyzer.js` phân đoạn, `syntax.js` gợi ý vai trò của cụm và `lookup-ui.js` dựng kết quả. Worker chuẩn bị chỉ mục khi người dùng tập trung vào ô tìm kiếm hoặc mở tác vụ cần tra. Đường dự phòng xây chỉ mục theo nhiều lượt để nhường giao diện. Chờ IME hoàn tất, hủy truy vấn cũ và giữ focus trong ô tìm kiếm. Sau 240 ms, dựng tối đa ba gợi ý và giữ bài đang xem. Enter hoặc Xem tất cả mới mở trang kết quả, đi lên đầu và ghi lịch sử. Mở chi tiết từ gợi ý giữ nguyên bài và vị trí.
- Kho `assets/dictionary/v1/` chia theo khóa từ và ký tự. Worker và fallback dùng chung cách tải. Chỉ precache thư mục chỉ dẫn, từ lõi N5 và Kanji lõi. Lưu các phần mở rộng khi được tra cứu, giới hạn cache theo phiên bản dữ liệu. Chỉ phân nhóm những cách đọc có căn cứ từ mục từ. Giữ nghĩa tiếng Anh có nhãn khi thiếu tiếng Việt. Xem [nguồn và cách tái tạo](assets/dictionary/DATA-LICENSE.md) và [kiểm kê v5.52.5](docs/v5.52.5-review.md).
- `furigana-normalizer.js` xử lý clipboard cục bộ trong các công cụ học đã khai báo. Đọc ruby từ HTML vô hiệu hóa, giữ phần chữ gốc và cho hoàn tác. Với văn bản thuần, đối chiếu cách đọc và chỉ áp dụng khi người dùng chấp thuận. Giữ nguyên okurigana, dấu câu và nội dung mơ hồ.
- Tái sử dụng chỉ mục tách từ cho tiền tố của dạng chia. Chỉ sinh hậu tố chỉ người khi mục từ có metadata xác minh. Giữ độc lập mục từ khớp chính xác, dạng chia, gợi ý hoàn thành và suy luận. Kiểm tra nghĩa của dạng ngay ở kết quả mặc định. [Rà soát v5.52.3](docs/v5.52.3-review.md).
- Giao diện kết quả dùng `assets/search/result-ui.js` và bề mặt trong `assets/search/result.css`. Kết quả câu gom thao tác trong một thanh, giữ tab và khung tra cứu khi quay lại. Giữ nguồn cách đọc, chỉ ưu tiên trường Gemini khi dữ liệu cục bộ thiếu và câu khớp. Đổi phần trình bày không được gọi lại Gemini. Đọc [rà soát v5.52.2](docs/v5.52.2-review.md).
- Ngữ pháp chuyên sâu nằm ở `assets/grammar/`. `course.js` dùng đúng ID `GRAMMAR_DATA`, `comparisons.js` chứa các đối chiếu, `practice.js` giữ đáp án và hướng dẫn, `extensions.js` giữ mẫu mở rộng. `questions.js` liên kết câu hỏi và câu đáp biên tập theo ID. `question-view.js` dùng chung cho bài học và kết quả tra cứu. Luyện trả lời mở trình Kiểm tra câu hiện có. Phần chia thể gọi `assets/search/morphology.js` với từ gốc và nhóm đã xác định.
- `assets/learning/` chứa Luyện đặt câu và Kiểm tra câu. Cả hai mở trong cửa sổ tra cứu. Bài tự do dùng đối chiếu. Lỗi chắc chắn mới có thể lưu khi người dùng chọn, qua cùng khóa Sổ tay và chốt ghi dữ liệu. Grammar Checker dùng chung chỉ mục và quy tắc chia thể với Worker.
- Sau khi sửa dữ liệu bài học hoặc ví dụ, chạy `node tools/build-grammar-index.mjs` và commit `assets/grammar/search-data.js`. Worker dùng chỉ mục sinh sẵn. Bộ kiểm thử kiểm tra không lệch dữ liệu. Giữ các module ngữ pháp trong cache PWA. Đọc [rà soát v5.50](docs/v5.50-review.md).
- `builtin-dictionary.json` giữ kho Wiktionary/Kaikki đã có với CC BY-SA 4.0. Tách kho tích hợp khỏi HTML để tải khi tra cứu. Kho nhập giữ IndexedDB `n5_external_dictionary_v1` và mở khi tra cứu hoặc quản lý từ điển. Khi thêm dữ liệu, ghi nguồn, điều khoản, dung lượng và kết quả kiểm tra ngoại tuyến vào tài liệu phiên bản. Đọc [rà soát v5.49](docs/v5.49-review.md).
- `jmdict-essentials.json` là kho JP–Việt chọn lọc, gắn ID JMdict và nhóm chia từ bản nguồn. Giữ thông tin nguồn, giấy phép và ràng buộc cách viết/cách đọc. Từ điển nhập thiếu nhóm tin cậy dùng để tra mặt chữ và tách câu. Cửa sổ tra cứu giữ từng khung nội dung và vị trí cuộn khi tra nối tiếp. Đọc [rà soát v5.51](docs/v5.51-review.md).
- Lịch sử tra cứu chủ động lưu tiếp tục dùng `n5_smart_search_history` và trường `searchHistory` hiện có. `n5_recent_lookup_v1` và `n5_lookup_display_v1` là tùy chọn trên thiết bị. Phần thêm từ vào lịch ôn dùng ID giáo trình và giữ thời điểm, mức độ ghi nhớ, số lần ôn đã có.
- Khóa `n5_smart_study_v1` lưu thiết lập, buổi học, lịch sử và hoạt động có giới hạn. Trường tùy chọn `smartStudy` trong JSON sao lưu và Cloud Sync giữ tương thích khi nhận bản cũ. Giữ Web Locks, dấu hiệu vị trí câu, kiểm tra revision và chốt buổi đang dở. Đọc [rà soát v5.48](docs/v5.48-review.md).
- Đọc [rà soát v5.47](docs/v5.47-review.md) để xem số đo, giới hạn đồng bộ, lộ trình tách module và dữ liệu dùng cho Smart Study.
- Lucide 1.77.0 được lưu tại `assets/vendor/` cùng giấy phép. `assets/fonts/v1/` giữ các font WOFF2 và giấy phép OFL. Ưu tiên bộ tiếng Việt và bộ Kana/Kanji lõi cho offline, chia phần Kanji bổ sung theo `unicode-range` và giữ font hệ thống dự phòng. Phát âm dùng Web Speech API và giọng trên thiết bị. Giọng đã tải là điều kiện để luyện nghe ngoại tuyến.
- Tiến độ, ôn SRS, câu sai, Flashcard cá nhân, tuỳ chọn và phiên đăng nhập nằm trong Local Storage. Kho từ điển nhập thêm sử dụng IndexedDB. Supabase Authentication và bảng `n5_user_data` cung cấp đồng bộ ảnh chụp có kiểm tra revision. Đồng bộ tự động do người dùng bật và chạy khi ứng dụng mở.
- `assets/data/kanji-templates.bin` giữ mẫu nhận dạng KanjiVG và `kanji-strokes.json` giữ đường nét. Tải khi mở nhận dạng hoặc xem nét, qua cache PWA. Khi tách hoặc cập nhật tệp, đối chiếu với dữ liệu cũ và thử chữ viết tay ngoại tuyến. Tùy chọn `n5_effects_mode_v1` xuất qua trường `uiEffects` tùy chọn. Bản sao lưu cũ thiếu trường này giữ chế độ trên thiết bị.

- Handwriting Search dùng `assets/ui/handwriting.css` và `assets/ui/handwriting.js` cho cửa sổ, cuộn nội bộ và vẽ canvas theo DPR. Giữ tọa độ nét ở hệ 480 × 480 khi đổi bố cục. Worker và đường dự phòng dùng cùng thuật toán hình học. Kho trong bài có 161 chữ. Khi khớp yếu, giữ lựa chọn phạm vi và cho người dùng chủ động dùng kho mở rộng. Khi chọn ứng viên, chuyển ký tự sang Universal Search. [Rà soát v5.52.4](docs/v5.52.4-review.md).

- `assets/translation/` chứa bản dịch tham khảo, lịch sử IndexedDB riêng, schema dùng chung và giao diện nạp khi cần. Trình duyệt gửi câu và chiều dịch tới `supabase/functions/smart-translate` khi được yêu cầu hoặc khi chế độ tự động đã bật. Chỉ secrets phía máy chủ giữ khóa Gemini. RPC hạn mức riêng có migration trong `supabase/migrations/`. Đọc [rà soát v5.52.1](docs/v5.52.1-review.md).

## Bảo toàn dữ liệu và tính năng

- Giữ các kho từ vựng, Kanji, ngữ pháp, Flashcard Nhật–Việt, SRS, danh sách chưa nhớ, sổ tay câu sai, luyện chia thể, luyện viết Kanji, tìm kiếm toàn cục/Romaji/biến thể, nghe/đọc/Shadowing, thi JLPT, thống kê và Backup & Restore. Giữ tương thích với dữ liệu cũ và sao lưu JSON đã tạo.
- Không xóa Local Storage hoặc IndexedDB khi cài đặt, làm mới hay cập nhật PWA. Giữ khoá lưu, ID giáo trình, định dạng sao lưu và cơ chế khôi phục. Dùng dữ liệu thử riêng khi kiểm thử.
- Không thay đổi dự án Supabase, schema hoặc chính sách truy cập nếu không thực sự cần cho nhiệm vụ. Giữ kiểm tra revision, khôi phục và bước chọn bản khi có xung đột. Không ghi token, mật khẩu hoặc khoá đặc quyền vào repository, cache hay log. Yêu cầu Supabase và dịch vụ bên ngoài đi qua mạng như trước.

## Kiểm thử tự động

- Chạy Playwright tại `.github/tests`. Chạy `npm ci`, `npx playwright install chromium webkit`, rồi `npm test`. Biến `N5_TEST_BROWSER=webkit` chọn WebKit. GitHub Actions chạy cả hai engine khi PR vào `main` và khi cập nhật `main`.
- Bộ kiểm thử phục vụ website theo đường dẫn con như Pages và mô phỏng Supabase trong trình duyệt. Khi sửa đồng bộ, giữ kiểm tra revision, chốt cho dữ liệu thay đổi trong tab khác và bước chọn lại khi revision cloud đã đổi. Khi sửa PWA, kiểm tra cả cache bị thu hồi và tài nguyên phát hành không đồng nhất.
- Khi đổi Smart Study, kiểm tra cùng một buổi qua reload và ngoại tuyến, trạng thái lật/đã trả lời, sao lưu cũ và xung đột snapshot giữa thiết bị. Tách tự đánh giá khỏi đúng/sai và kiểm tra xóa phân tích độc lập với tiến độ.
- Với Universal Search, chạy nhóm ca `search.test.cjs` cùng kho tích hợp. Kiểm tra tiền tố, Romaji, lỗi một ký tự, từ gốc, dạng kết hợp, câu mơ hồ/ngoài kho, modal, quay lại trang kết quả, nhập kho, và nạp lại ngoại tuyến. Gắn nguồn cho bản đối chiếu, bản theo quy tắc và Gemini. Giữ nghĩa cụm khi câu chưa đủ căn cứ. Đừng suy nhóm của động từ đồng âm chỉ từ cách đọc.
- Khi sửa bảng viết, kiểm tra cuộn tới ứng viên cuối ở màn hình thấp, wheel trên canvas, vùng cuộn nền, pointer capture, giữ nét sau đổi kích thước, Escape và focus. Kiểm tra các mẫu đủ, thiếu, thừa và đảo nét ở hai phạm vi, và thử chọn ứng viên khi mất mạng.
- Khi đổi dịch thuật, kiểm thử câu ngoài kho, câu lược chủ ngữ, Romaji mơ hồ, kết quả cục bộ khi mất mạng, cache, hủy lượt cũ, quyền, quota và dữ liệu AI sai schema. CI dùng provider mô phỏng.
- Khi đổi ngữ pháp, kiểm tra ID, liên kết, đáp án và ví dụ bằng kiểm thử dữ liệu. Rà ngôn ngữ riêng theo bối cảnh và nguồn. Bài dịch và đặt câu dùng bản đối chiếu. Chỉ lựa chọn sai có đáp án phân biệt rõ mới vào Sổ tay câu sai.
- Chạy `node .github/tests/search-benchmark.cjs <đường-dẫn-bản-gốc>` sau khi cài Playwright để đo hai bản trên cùng tập truy vấn. Giữ cùng CPU giả lập, viewport, trạng thái cache và phạm vi phép đo. Dùng `N5_BENCH_COMPARE_ONLY=1` để chỉ so sánh hai bản ở chế độ tự động. Ghi lại truy vấn có khoảng cách khung hình lớn nhất và độ trễ debounce.
- Chạy `node .github/tests/pwa-migration.cjs <thư-mục-bản-trước>` trên Chromium và WebKit. Phép thử đổi tài nguyên trên cùng origin, đối chiếu dữ liệu sao lưu và kiểu hiển thị trước/sau, rồi tra cứu sau khi ngắt mạng.
- Đo hiệu suất với cùng tập truy vấn, dữ liệu, thiết lập CPU và viewport trước/sau. Ghi rõ phép đo nào gồm dựng chỉ mục lần đầu và phép đo nào chạy sau khi chỉ mục có sẵn.

## Quy trình nâng cấp

1. Đối chiếu mã trên `main` với GitHub Pages đang chạy và xác định phạm vi, nguyên nhân lỗi.
2. Tạo nhánh phát triển riêng từ `main`, thực hiện thay đổi nhỏ nhất đáp ứng nhiệm vụ.
3. Chạy kiểm tra cú pháp và kiểm tra hồi quy bằng trình duyệt trên bản phục vụ qua HTTP localhost, dưới đường dẫn con như GitHub Pages. Kiểm tra giao diện desktop/mobile, sáng/tối, các tác vụ học bị ảnh hưởng và khôi phục từ bản sao lưu cũ.
4. Với PWA, kiểm tra cài lần đầu, mở lại khi mất mạng, cập nhật với hai tab đang mở, giữ tiến độ qua cập nhật và đồng bộ khi kết nối lại. Kiểm tra cache chỉ có tài nguyên tĩnh. Khi có thiết bị, kiểm tra cài đặt từ Safari trên iPhone và từ Chrome/Edge trên Windows. Ghi rõ nội dung kiểm tra bằng mô phỏng và trên thiết bị thật.
5. Cập nhật phiên bản trong tiêu đề, meta `n5-release`, chuỗi truy vấn tài nguyên và import UI tra cứu, nhãn Cloud Sync, nhãn bản sao lưu và hằng `RELEASE` trong `sw.js`. Liệt kê CSS, worker, các module nhập từ worker và JSON cần ngoại tuyến trong cache. Kiểm tra lần tra đầu sau reload khi máy chủ ngừng trả tệp.
6. Ghi changelog, commit và mở Pull Request vào `main` với kết quả kiểm tra và giới hạn bằng tiếng Việt. Chủ repository duyệt và merge.
