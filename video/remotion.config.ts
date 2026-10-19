import { Config } from '@remotion/cli/config';

// The render machine is low on RAM: one tab, JPEG frames, H.264.
Config.setConcurrency(1);
Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
