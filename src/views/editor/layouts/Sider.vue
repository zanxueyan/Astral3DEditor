<script setup lang="ts">
import {h,onBeforeUnmount, onMounted,ref,markRaw,nextTick} from "vue";
import { NIcon, NTooltip } from "naive-ui";
import type { TabsInst } from 'naive-ui'
import {GlobeAsia,Uncharted,Delicious,DrawPolygon,ImageRegular} from "@vicons/fa";
import {ResultOld,Script,Draw,MagicWandFilled} from "@vicons/carbon";

import {t} from "@/language";
import {useAddSignal,useRemoveSignal} from "@/hooks/useSignal";
import SidebarScene from "@/components/sidebar/SidebarScene.vue";
import SidebarEffect from "@/components/sidebar/SidebarEffect.vue";
import SidebarHistory from "@/components/sidebar/SidebarHistory.vue";
import SidebarObject from "@/components/sidebar/SidebarObject.vue";
import SidebarGeometry from "@/components/sidebar/SidebarGeometry.vue";
import SidebarMaterial from "@/components/sidebar/SidebarMaterial.vue";
import SidebarAnimations from "@/components/sidebar/SidebarAnimations.vue";
import SidebarScript from "@/components/sidebar/SidebarScript.vue";
import SidebarDrawing from "@/components/sidebar/SidebarDrawing.vue";

const tabsInstRef = ref<TabsInst | null>(null);
const tabs = ref<Array<any>>([]);
const current = ref<string>('scene');

function iconTabName(text:string,icon:any){
  return h(NTooltip,{
    placement:"left"
  }, {
    default:() => t(`layout.sider["${text}"]`),
    trigger:() => h(NIcon, {size:14}, h(icon)),
  })
}

function setTabs(object){
  const sceneTabs = [
    {name:"scene",icon:{text:'Scene config',component:GlobeAsia},component:markRaw(SidebarScene)},
    {name:"effect",icon:{text:'Post processing',component:MagicWandFilled},component:markRaw(SidebarEffect)},
    {name:"history",icon:{text:'History',component:ResultOld},component:markRaw(SidebarHistory)},
    {name:"drawing",icon:{text:'Scene drawing',component:ImageRegular},component:markRaw(SidebarDrawing)},
  ];
  const object3DTabs = [
    {name:"object",icon:{text:'Object',component:Uncharted},component:markRaw(SidebarObject)},
    {name:"geometry",icon:{text:'Geometry',component:DrawPolygon},component:markRaw(SidebarGeometry)},
    {name:"material",icon:{text:'Material',component:Delicious},component:markRaw(SidebarMaterial)},
    {name:"animations",icon:{text:'Animations',component:Draw},component:markRaw(SidebarAnimations)},
    {name:"script",icon:{text:'Script',component:Script},component:markRaw(SidebarScript)},
  ]

  if(object){
    // TODO: 开发人员可以按类型扩展侧边栏
    switch (object.type) {
      case "HtmlPanel":
      case "HtmlSprite":
        // 如果选中的对象是HtmlPanel，就添HtmlPanel相关的操作侧边栏
        break;
    }
  }

  tabs.value = [...sceneTabs,...object3DTabs];

  nextTick(() => tabsInstRef.value?.syncBarPosition());
}

onMounted(()=>{
  useAddSignal("objectSelected",setTabs);

  setTabs(undefined);
})
onBeforeUnmount(() => {
  useRemoveSignal("objectSelected",setTabs);
})
</script>

<template>
  <n-tabs ref="tabsInstRef" v-model:value="current" type="line" size="small" pane-class="!p-10px overflow-y-auto" id="sidebar-attributes"
          placement="left">
    <n-tab-pane v-for="t in tabs" :key="t.name" :name="t.name" :tab="iconTabName(t.icon.text,t.icon.component)" display-directive="show" :disabled="t.name === 'disabled'">
      <component :is="t.component" />
    </n-tab-pane>
  </n-tabs>
</template>

<style lang="less" scoped>
.n-tabs{
  height: calc(100vh - var(--header-height) - var(--footer-height));

  // 配置按功能类型（常驻/动态） 分割
  :deep(.n-tabs-wrapper){
    .n-tabs-tab-wrapper:nth-child(6){
      margin-top: 10px;
      border-top: 1px solid var(--n-tab-border-color);
    }
  }
}
</style>
