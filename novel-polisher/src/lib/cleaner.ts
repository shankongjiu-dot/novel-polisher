import type { Source, Suggestion, SuggestionKind } from '../types'

interface LineRule {
  kind: SuggestionKind
  reason: string
  re: RegExp
}

const LINE_RULES: LineRule[] = [
  {
    kind: 'watermark',
    reason: '网址开头的广告/跳转行',
    re: /^\s*(?:https?:\/\/|www\.)[^\s，。！？；]{3,}/i,
  },
  {
    kind: 'garbage',
    reason: '纯星号打码头（无正文内容）整段',
    re: /^[\s*＊.。·]{2,20}$/,
  },
  {
    kind: 'ad',
    reason: '广告/软文整段',
    re: /(最新章节|更多精彩|阅读最新|点击[查看阅读]|请收藏本站|手机用户请|本站提供|加入书签|推荐票|月票|求收藏|求推荐|求订阅|最新章节请访问|首发站点)/i,
  },
  {
    kind: 'watermark',
    reason: '站点水印整段',
    re: /(笔趣阁|顶点小说|笔下文学|小说阅读网|顶点中文网|乐文小说网|本章未完|点击下一页|请记住本站|章节错误|点此举报|收藏本站|书签)/i,
  },
  {
    kind: 'watermark',
    reason: '站点声明/版权整段',
    re: /声明.{0,8}(本书由|自网络|整理|仅供|版权|正版)|本书由.{0,24}(收集整理|整理制作|版权归原作者|网络收集)/,
  },
  {
    kind: 'watermark',
    reason: '站点下载/格式推广整段',
    re: /(txt|epub|mobi|下载|手机阅读|电子书|手打|首发).{0,16}(www\.|[a-z0-9-]+\.(?:com|cn|net|org|cc|xyz|io|top|vip))\b/i,
  },
  {
    kind: 'garbage',
    reason: '乱码/异常字符',
    re: /[\p{C}\uFFFD]/u,
  },
]

const INLINE_RE = /(https?:\/\/[^\s，。！？；：""''、]+|(?:www\.)?[a-zA-Z0-9-]+\.(?:com|cn|net|org|cc|xyz|io|top|vip))[^\s，。！？；：""''、]*/gi

function cleanInline(text: string): string {
  return text.replace(INLINE_RE, '').replace(/\s{2,}/g, ' ').trim()
}

function isJunkResidue(text: string): boolean {
  return text.length < 12 && !/[。！？!?“”…]/.test(text) && !/[，、；;]/.test(text)
}

export function cleanSource(source: Source): Suggestion[] {
  const suggestions: Suggestion[] = []

  for (const chapter of source.chapters) {
    chapter.paragraphs.forEach((para, idx) => {
      for (const rule of LINE_RULES) {
        if (rule.re.test(para)) {
          suggestions.push({
            id: `${source.id}-${chapter.id}-${idx}-line`,
            sourceId: source.id,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            paragraphIndex: idx,
            original: para,
            corrected: '',
            kind: rule.kind,
            reason: rule.reason,
            source: 'rule',
            status: 'pending',
          })
          return
        }
      }

      const cleaned = cleanInline(para)
      if (cleaned !== para) {
        const junk = isJunkResidue(cleaned)
        suggestions.push({
          id: `${source.id}-${chapter.id}-${idx}-inline`,
          sourceId: source.id,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          paragraphIndex: idx,
          original: para,
          corrected: junk ? '' : cleaned,
          kind: 'watermark',
          reason: junk ? '行内网址（清除后无有效内容，整段删除）' : '行内网址/网站名',
          source: 'rule',
          status: 'pending',
        })
      }
    })
  }

  return suggestions
}