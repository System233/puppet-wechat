#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
/**
 *   Wechaty - https://github.com/chatie/wechaty
 *
 *   @copyright 2016-2018 Huan LI <zixia@zixia.net>
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   Unless required by applicable law or agreed to in writing, software
 *   distributed under the License is distributed on an "AS IS" BASIS,
 *   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *   See the License for the specific language governing permissions and
 *   limitations under the License.
 *
 */
import { test, sinon } from 'tstest'

import { log } from '../src/config.js'

import { PuppetWeChat } from '../src/puppet-wechat.js'
import { WebMessageMediaPayload, WebMessageType } from '../src/web-schemas.js'
import { FileBox } from 'file-box'
import request from 'request'
import { extname } from 'path'

class PuppetTest extends PuppetWeChat {}

test('Send Attachment', async (t) => {
  const puppet = new PuppetTest()

  const sandbox = sinon.createSandbox()
  sandbox.stub(puppet.bridge, 'getCheckUploadUrl').returns(Promise.resolve('getCheckUploadUrl'))
  sandbox.stub(puppet.bridge, 'getUploadMediaUrl').returns(Promise.resolve('getUploadMediaUrl'))
  sandbox.stub(puppet.bridge, 'getBaseRequest').returns(Promise.resolve('{}'))
  sandbox.stub(puppet.bridge, 'getPassticket').returns(Promise.resolve('getPassticket'))
  sandbox.stub(puppet.bridge, 'cookies').returns(Promise.resolve([]))
  sandbox.stub(puppet.bridge, 'hostname').returns(Promise.resolve('hostname'))
  sandbox.replaceGetter(puppet, 'currentUserId', () => 'currentUserId')
  const conversationId = 'filehelper'
  const uploadMediaUrl = await puppet.bridge.getUploadMediaUrl()
  const checkUploadUrl = await puppet.bridge.getCheckUploadUrl()
  const mockedResCheckUpload = {
    AESKey: 'AESKey',
    Signature: 'Signature',
  }
  const mockedResUploadMedia = {
    MediaId: 'MediaId',
  }
  const getExtName = (filename: string) => {
    return extname(filename).slice(1)
  }
  const extToType = (ext: string): WebMessageType => {
    switch (ext.toLowerCase()) {
      case 'bmp':
      case 'jpeg':
      case 'jpg':
      case 'png':
        return WebMessageType.IMAGE
      case 'gif':
        return WebMessageType.EMOTICON
      case 'mp4':
        return WebMessageType.VIDEO
      default:
        return WebMessageType.APP
    }
  }
  const mockSendMedia = async (msg: WebMessageMediaPayload) => {
    log.silly('TestMessage', 'mocked bridge.sendMedia(%o)', msg)
    const ext = getExtName(msg.FileName)
    const msgType = extToType(ext)
    t.match(msg.MMFileExt, /^\w+$/)
    t.equal(msg.MsgType, msgType)
    t.equal(msg.MMFileExt, ext)
    return true
  }
  const mockPostRequest = (
    options: request.RequiredUriUrl & request.CoreOptions,
    callback?: request.RequestCallback,
  ): request.Request => {
    log.silly('TestMessage', 'mocked request.post(%o)', options)
    let path: string | null = null
    if ('url' in options) {
      if (typeof options.url === 'object') {
        path = options.url.path as string
      } else {
        path = options.url
      }
    } else if ('uri' in options) {
      if (typeof options.uri === 'object') {
        path = options.uri.path as string
      } else {
        path = options.uri
      }
    }
    t.not(path, null)
    if (path && callback) {
      if (path.includes(uploadMediaUrl)) {
        log.silly(
          'TestMessage',
          'requesting %s:%o',
          uploadMediaUrl,
          options.formData,
        )
        const formData = options.formData as {
          name: string;
          mediatype: string;
          type: string;
          uploadmediarequest: string;
        }
        const uploadmediarequest = JSON.parse(formData.uploadmediarequest) as {
          AESKey: string;
          BaseRequest: any;
          ClientMediaId: number;
          DataLen: number;
          FileMd5: string;
          FromUserName: string;
          MediaType: number;
          Signature: string;
          StartPos: number;
          ToUserName: string;
          TotalLen: number;
          UploadType: number;
        }
        const name = formData.name
        const ext = getExtName(name)
        let mediatype: string
        switch (extToType(ext)) {
          case WebMessageType.IMAGE:
            mediatype = 'pic'
            break
          case WebMessageType.VIDEO:
            mediatype = 'video'
            break
          default:
            mediatype = 'doc'
        }
        t.equal(formData.mediatype, mediatype)
        t.equal(uploadmediarequest.MediaType, 4)
        t.equal(uploadmediarequest.UploadType, 2)

        callback(null, {} as any, mockedResUploadMedia)
      } else if (path.includes(checkUploadUrl)) {
        callback(null, {} as any, mockedResCheckUpload)
      } else {
        log.silly('Unknown request:%s', path)
      }
    }
    return null as any
  }
  sandbox.stub(puppet.bridge, 'sendMedia').callsFake(mockSendMedia)
  sandbox.stub(request, 'post').callsFake(mockPostRequest)

  await Promise.all(
    [
      'png',
      'jpg',
      'jpeg',
      'bmp',
      'gif',
      'html',
      'txt',
      'docx',
      'doc',
      'xlsx',
      'csv',
      'mp3',
      'mp4',
      'mkv',
    ].map(async (ext) => {
      const giffile = FileBox.fromBuffer(Buffer.alloc(10), 'test.' + ext)
      await puppet.messageSendFile(conversationId, giffile)
    }),
  )
  sandbox.restore()
})