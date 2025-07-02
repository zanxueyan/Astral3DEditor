/**
 * 用于生成渐进式 Web 应用
 */
import type { PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export function configPwaPlugin(): PluginOption {
    return VitePWA({
        registerType: 'autoUpdate',
        // dev环境下是否开启
        devOptions: {
            enabled: true,
        },
        // 注册ws方式
        injectRegister: 'auto',
        workbox: {
            // sw 预缓存的资源类型
            globPatterns: ['**/*.{js,css}'],
            // Error:  Configure "workbox.maximumFileSizeToCacheInBytes" to change the limit: the default value is 2 MiB.
            // 添加此项配置，增加需要缓存的最大文件大小,默认2MB
            // 但是 cesium/Cesium.js is 5.14 MB
            maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
        },
        manifest: {
            name: 'Astral 3D Editor',
            short_name: 'Astral 3D',
            description: '一款基于THREE.JS开发的专业的三维可视化编辑器',
            theme_color: '#63E2B7',
            icons: [
                {
                    src: '/static/images/logo/pwa/pwa-48x48.png',
                    sizes: '48x48',
                    type: 'image/png',
                },
                {
                    src: '/static/images/logo/pwa/pwa-64x64.png',
                    sizes: '64x64',
                    type: 'image/png',
                },
                {
                    src: '/static/images/logo/pwa/pwa-96x96.png',
                    sizes: '96x96',
                    type: 'image/png',
                },
                {
                    src: '/static/images/logo/pwa/pwa-192x192.png',
                    sizes: '192x192',
                    type: 'image/png',
                },
                {
                    src: '/static/images/logo/pwa/pwa-256x256.png',
                    sizes: '256x256',
                    type: 'image/png',
                },
                {
                    src: '/static/images/logo/pwa/pwa-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                },
                {
                    src: '/static/images/logo/pwa/pwa-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'any',
                },
                {
                    src: '/static/images/logo/pwa/pwa-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                },
            ],
        },
    });
}