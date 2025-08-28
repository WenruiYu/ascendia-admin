import { Page, Layout, Card, BlockStack, Text, List, Link } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function HomeReadme() {
  return (
    <Page>
      <TitleBar title="项目说明（Admin 内部工具）" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">使用指南</Text>
              <Text as="p">
                这是 Ascendia 的内部管理应用，用于维护行程（产品）的结构化数据：
                出团日期、每日行程、景点、酒店等。请按下列顺序操作：
              </Text>
              <List type="number">
                <List.Item>
                  <Text as="span">在 Shopify 后台 → <b>设置 → Metafields and metaobjects</b> 中确保以下类型已创建：</Text>
                  <List>
                    <List.Item>Metaobject：<b>attraction</b>（景点：title/description/hero_image/gallery…）</List.Item>
                    <List.Item>Metaobject：<b>hotel</b>（酒店：name/description/hero_image/gallery…）</List.Item>
                    <List.Item>Metaobject：<b>itinerary_day</b>（行程日：day_number/title/description/meals/attractions/hotel/label）</List.Item>
                    <List.Item>产品 Metafield：<b>custom.itinerary_days</b>（list.metaobject_reference → itinerary_day）</List.Item>
                    <List.Item>产品 Metafield：<b>custom.season_calendar</b>（list.metaobject_reference → season_date）</List.Item>
                  </List>
                </List.Item>
                <List.Item>
                  <Text as="span">维护基础资源：</Text>
                  <List>
                    <List.Item><Link url="/app/attractions">Attractions</Link>：新增/编辑景点，选择主图与图集</List.Item>
                    <List.Item><Link url="/app/hotels">Hotels</Link>：新增/编辑酒店，选择主图与图集</List.Item>
                  </List>
                </List.Item>
                <List.Item>
                  <Text as="span">为每个产品配置：</Text>
                  <List>
                    <List.Item><Link url="/app/itinerary">Itinerary builder</Link>：添加每日行程（Day 1/2/…、景点集合、酒店、餐食）</List.Item>
                    <List.Item><Link url="/app/departures">Departure dates</Link>：批量选择出团日期，标记旺季/淡季</List.Item>
                  </List>
                </List.Item>
              </List>

              <Text as="h2" variant="headingMd">注意事项</Text>
              <List>
                <List.Item>本应用需要以下权限：read/write products、read/write metaobjects、read files（如需上传则加 write files）。</List.Item>
                <List.Item>新增字段或权限后，需重新安装应用以生效。</List.Item>
                <List.Item>前台主题读取上述 Metaobject/Metafield 渲染页面。</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
