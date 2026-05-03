package image

import (
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/432539/gpt2api/pkg/resp"
)

// ImageProxyURLBuilder 生成代理 URL 的函数签名,由 gateway 包注入以避免循环引用。
type ImageProxyURLBuilder func(taskID string, idx int) string

// AdminHandler 管理员视角下的生成记录接口。
type AdminHandler struct {
	dao      *DAO
	ProxyURL ImageProxyURLBuilder
}

// NewAdminHandler 构造。
func NewAdminHandler(dao *DAO) *AdminHandler {
	return &AdminHandler{dao: dao}
}

// List GET /api/admin/image-tasks
// 查询参数:page / page_size / user_id / keyword(prompt 或邮箱模糊) / status
func (h *AdminHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	size, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if size < 1 {
		size = 20
	}
	if size > 200 {
		size = 200
	}
	userID, _ := strconv.ParseUint(c.Query("user_id"), 10, 64)

	f := AdminTaskFilter{
		UserID:  userID,
		Keyword: c.Query("keyword"),
		Status:  c.Query("status"),
	}

	rows, total, err := h.dao.ListAdmin(c.Request.Context(), f, size, (page-1)*size)
	if err != nil {
		resp.Internal(c, err.Error())
		return
	}

	// 把 result_urls JSON bytes 解成可读字符串数组后输出
	type rowOut struct {
		AdminTaskRow
		ResultURLsParsed []string `json:"result_urls_parsed"`
	}
	out := make([]rowOut, 0, len(rows))
	for _, r := range rows {
		// 用代理 URL 替换上游原始签名 URL,避免过期/跨域/墙导致加载失败
		rawURLs := r.DecodeResultURLs()
		proxyURLs := make([]string, len(rawURLs))
		for i := range rawURLs {
			if h.ProxyURL != nil {
				proxyURLs[i] = h.ProxyURL(r.TaskID, i)
			} else {
				proxyURLs[i] = fmt.Sprintf("/p/img/%s/%d", r.TaskID, i)
			}
		}
		out = append(out, rowOut{
			AdminTaskRow:     r,
			ResultURLsParsed: proxyURLs,
		})
	}

	resp.OK(c, gin.H{
		"list":      out,
		"total":     total,
		"page":      page,
		"page_size": size,
	})
}
