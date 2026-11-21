# N5 Master Hub

Ứng dụng học JLPT N5 cá nhân bằng tiếng Việt, ưu tiên Safari trên iPhone và Chrome/Edge trên Windows. GitHub Pages xuất bản từ `main` tại thư mục gốc của repository. Dùng đường dẫn tương đối để ứng dụng, manifest và service worker hoạt động dưới `/n5-master-hub-forbegginer/` và trên máy phát triển.

## Kiến trúc

- `index.html` chứa giao diện Liquid Glass, các kho dữ liệu giáo trình và logic học. Giữ bố cục sidebar trên PC, điều hướng dưới trên mobile, chế độ sáng/tối/tự động và khoảng đệm safe area của iOS. Ưu tiên sửa đúng khu vực liên quan và tránh viết lại toàn bộ.
- `manifest.webmanifest` khai báo URL khởi động, phạm vi, chế độ standalone và biểu tượng. Giữ `id` và `start_url` ổn định để bản mới tiếp tục dùng danh tính ứng dụng đã cài.
- `sw.js` lưu HTML và danh sách tài nguyên tĩnh công khai theo phiên bản và phạm vi website. Cập nhật tải đủ tài nguyên trước khi kích hoạt, rồi dọn cache cũ của chính ứng dụng. `pwa.js` hiển thị trạng thái, hỗ trợ cài đặt và xin xác nhận trước khi mở lại phiên học.
- Tailwind CSS 3.4.17 được biên dịch tĩnh từ `index.html` và `assets/smart-study.js` và commit vào `assets/tailwind.css`. Giữ tên đầy đủ của utility class trong template hoặc khai báo safelist khi tạo tên động. Khi thay đổi class hoặc cấu hình, chạy lệnh sau từ thư mục gốc.

  ```sh
  npx --yes tailwindcss@3.4.17 -c tools/tailwind.config.cjs -i tools/tailwind.css -o assets/tailwind.css --minify
  ```

- Smart Study dùng `assets/study-engine.js` cho đề xuất và biểu diễn dữ liệu, `assets/smart-study.js` cho màn hình và phiên học. Cả hai phải được đưa vào cache theo phiên bản. Giữ các ID giáo trình và ưu tiên dùng trình chấm sẵn có.
- Universal Search ở `assets/search/`. `search-engine.js` xếp hạng, `morphology.js` tạo dạng chia từ mục có nhóm xác định, `sentence-analyzer.js` phân đoạn, `grammar-data.js` giữ bài giảng và liên kết ID giáo trình, `lookup-ui.js` dựng kết quả và chi tiết. Khởi tạo khi tra lần đầu, chạy lập chỉ mục và phân tích trong module worker. Đường dự phòng chia công việc xây chỉ mục thành nhiều lượt nhường giao diện.
- `builtin-dictionary.json` giữ kho Wiktionary/Kaikki đã có với CC BY-SA 4.0. Tách kho tích hợp khỏi HTML để tải khi tra cứu. Kho nhập giữ IndexedDB `n5_external_dictionary_v1` và mở khi tra cứu hoặc quản lý từ điển. Khi thêm dữ liệu, ghi nguồn, điều khoản, dung lượng và kết quả kiểm tra ngoại tuyến vào tài liệu phiên bản. Đọc [rà soát v5.49](docs/v5.49-review.md).
- Lịch sử tra cứu chủ động lưu tiếp tục dùng `n5_smart_search_history` và trường `searchHistory` hiện có. `n5_recent_lookup_v1` và `n5_lookup_display_v1` là tùy chọn trên thiết bị. Phần thêm từ vào lịch ôn dùng ID giáo trình và giữ thời điểm, mức độ ghi nhớ, số lần ôn đã có.
- Khóa `n5_smart_study_v1` lưu thiết lập, buổi học, lịch sử và hoạt động có giới hạn. Trường tùy chọn `smartStudy` trong JSON sao lưu và Cloud Sync giữ tương thích khi nhận bản cũ. Giữ Web Locks, dấu hiệu vị trí câu, kiểm tra revision và chốt buổi đang dở. Đọc [rà soát v5.48](docs/v5.48-review.md).
- Đọc [rà soát v5.47](docs/v5.47-review.md) để xem số đo, giới hạn đồng bộ, lộ trình tách module và dữ liệu dùng cho Smart Study.
- Lucide 1.77.0 được lưu tại `assets/vendor/` cùng giấy phép. Font web là phần bổ sung khi có mạng. Nội dung học dùng được bằng font hệ thống. Phát âm dùng Web Speech API và giọng trên thiết bị. Giọng đã tải là điều kiện để luyện nghe ngoại tuyến.
- Tiến độ, ôn SRS, câu sai, Flashcard cá nhân, tuỳ chọn và phiên đăng nhập nằm trong Local Storage. Kho từ điển nhập thêm sử dụng IndexedDB. Supabase Authentication và bảng `n5_user_data` cung cấp đồng bộ ảnh chụp có kiểm tra revision. Đồng bộ tự động do người dùng bật và chạy khi ứng dụng mở.

## Bảo toàn dữ liệu và tính năng

- Giữ các kho từ vựng, Kanji, ngữ pháp, Flashcard Nhật–Việt, SRS, danh sách chưa nhớ, sổ tay câu sai, luyện chia thể, luyện viết Kanji, tìm kiếm toàn cục/Romaji/biến thể, nghe/đọc/Shadowing, thi JLPT, thống kê và Backup & Restore. Giữ tương thích với dữ liệu cũ và sao lưu JSON đã tạo.
- Không xóa Local Storage hoặc IndexedDB khi cài đặt, làm mới hay cập nhật PWA. Giữ khoá lưu, ID giáo trình, định dạng sao lưu và cơ chế khôi phục. Dùng dữ liệu thử riêng khi kiểm thử.
- Không thay đổi dự án Supabase, schema hoặc chính sách truy cập nếu không thực sự cần cho nhiệm vụ. Giữ kiểm tra revision, khôi phục và bước chọn bản khi có xung đột. Không ghi token, mật khẩu hoặc khoá đặc quyền vào repository, cache hay log. Yêu cầu Supabase và dịch vụ bên ngoài đi qua mạng như trước.

## Kiểm thử tự động

- Chạy Playwright tại `.github/tests`. Chạy `npm ci`, `npx playwright install chromium webkit`, rồi `npm test`. Biến `N5_TEST_BROWSER=webkit` chọn WebKit. GitHub Actions chạy cả hai engine khi PR vào `main` và khi cập nhật `main`.
- Bộ kiểm thử phục vụ website theo đường dẫn con như Pages và mô phỏng Supabase trong trình duyệt. Khi sửa đồng bộ, giữ kiểm tra revision, chốt cho dữ liệu thay đổi trong tab khác và bước chọn lại khi revision cloud đã đổi. Khi sửa PWA, kiểm tra cả cache bị thu hồi và tài nguyên phát hành không đồng nhất.
- Khi đổi Smart Study, kiểm tra cùng một buổi qua reload và ngoại tuyến, trạng thái lật/đã trả lời, sao lưu cũ và xung đột snapshot giữa thiết bị. Tách tự đánh giá khỏi đúng/sai và kiểm tra xóa phân tích độc lập với tiến độ.
- Với Universal Search, chạy nhóm ca `search.test.cjs` cùng kho tích hợp. Kiểm tra tiền tố, Romaji, lỗi một ký tự, từ gốc, dạng kết hợp, câu mơ hồ/ngoài kho, modal, quay lại trang kết quả, nhập kho, và nạp lại ngoại tuyến. Chỉ hiển thị bản dịch toàn câu khi có bản đối chiếu đã biên soạn. Đừng suy nhóm của động từ đồng âm chỉ từ cách đọc.
- Chạy `node .github/tests/search-benchmark.cjs <đường-dẫn-bản-gốc>` sau khi cài Playwright để đo hai bản trên cùng 16 truy vấn. Giữ cùng CPU giả lập, viewport, trạng thái cache và phạm vi phép đo.
- Đo hiệu suất với cùng tập truy vấn, dữ liệu, thiết lập CPU và viewport trước/sau. Ghi rõ phép đo nào gồm dựng chỉ mục lần đầu và phép đo nào chạy sau khi chỉ mục có sẵn.

## Quy trình nâng cấp

1. Đối chiếu mã trên `main` với GitHub Pages đang chạy và xác định phạm vi, nguyên nhân lỗi.
2. Tạo nhánh phát triển riêng từ `main`, thực hiện thay đổi nhỏ nhất đáp ứng nhiệm vụ.
3. Chạy kiểm tra cú pháp và kiểm tra hồi quy bằng trình duyệt trên bản phục vụ qua HTTP localhost, dưới đường dẫn con như GitHub Pages. Kiểm tra giao diện desktop/mobile, sáng/tối, các tác vụ học bị ảnh hưởng và khôi phục từ bản sao lưu cũ.
4. Với PWA, kiểm tra cài lần đầu, mở lại khi mất mạng, cập nhật với hai tab đang mở, giữ tiến độ qua cập nhật và đồng bộ khi kết nối lại. Kiểm tra cache chỉ có tài nguyên tĩnh. Khi có thiết bị, kiểm tra cài đặt từ Safari trên iPhone và từ Chrome/Edge trên Windows. Ghi rõ nội dung kiểm tra bằng mô phỏng và trên thiết bị thật.
5. Cập nhật phiên bản trong tiêu đề, meta `n5-release`, chuỗi truy vấn tài nguyên và import UI tra cứu, nhãn Cloud Sync, nhãn bản sao lưu và hằng `RELEASE` trong `sw.js`. Liệt kê CSS, worker, các module nhập từ worker và JSON cần ngoại tuyến trong cache. Kiểm tra lần tra đầu sau reload khi máy chủ ngừng trả tệp.
6. Ghi changelog, commit và mở Pull Request vào `main` với kết quả kiểm tra và giới hạn bằng tiếng Việt. Chủ repository duyệt và merge.
