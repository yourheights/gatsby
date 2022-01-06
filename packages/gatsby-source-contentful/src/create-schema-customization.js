// @ts-check
import _ from "lodash"
import { fetchContentTypes } from "./fetch"
import { generateSchema } from "./generate-schema"
import { createPluginConfig } from "./plugin-options"
import { CascadedContext } from "./cascaded-context"

async function getContentTypesFromContentFul({
  cache,
  reporter,
  pluginConfig,
}) {
  // Get content type items from Contentful
  const contentTypeItems = await fetchContentTypes({ pluginConfig, reporter })

  // Store processed content types in cache for sourceNodes
  const sourceId = `${pluginConfig.get(`spaceId`)}-${pluginConfig.get(
    `environment`
  )}`
  const CACHE_CONTENT_TYPES = `contentful-content-types-${sourceId}`
  await cache.set(CACHE_CONTENT_TYPES, contentTypeItems)

  return contentTypeItems
}

const localeState = new CascadedContext()

export async function createSchemaCustomization(
  { schema, actions, reporter, cache },
  pluginOptions
) {
  const { createTypes } = actions

  const pluginConfig = createPluginConfig(pluginOptions)

  let contentTypeItems
  if (process.env.GATSBY_WORKER_ID) {
    const sourceId = `${pluginConfig.get(`spaceId`)}-${pluginConfig.get(
      `environment`
    )}`
    contentTypeItems = await cache.get(`contentful-content-types-${sourceId}`)
  } else {
    contentTypeItems = await getContentTypesFromContentFul({
      cache,
      reporter,
      pluginConfig,
    })
  }

  actions.createResolverContext({ localeState })
  actions.createFieldExtension({
    name: `contentfulLocalized`,
    args: {
      contentfulFieldId: {
        type: `String!`,
      },
    },
    extend(options) {
      return {
        args: {
          locale: `String`,
        },
        resolve(source, args, context, info) {
          console.log(
            `contentfulLocalized field extension resolver`,
            JSON.stringify(
              {
                source,
                args,
                contextSourceContentful: context.sourceContentful,
              },
              null,
              2
            )
          )

          let locale
          // We have to do this because it works #bestCommentEver #markWhatsHacky
          // if (source["__gatsby_resolved"]?.sys.locale) {
          //   locale = source["__gatsby_resolved"].sys.locale
          // }
          // @todo we need to figure out the querys locale

          if (args.locale) {
            context.sourceContentful.localeState.set(info, args.locale)
            locale = args.locale
          } else {
            locale = context.sourceContentful.localeState.get(info) || `en-US` // @todo we need default locale
          }
          const fieldValue = source.localeTest[options.contentfulFieldId] || {}

          console.log({ fieldValue, locale, options })

          return fieldValue[locale] || null
        },
      }
    },
  })

  // Generate schemas based on Contentful content model
  generateSchema({ createTypes, schema, pluginConfig, contentTypeItems })
}
