# 获取任务详情

## OpenAPI Specification

````yaml
openapi: 3.0.1
info:
  title: ""
  description: ""
  version: 1.0.0
paths:
  /api/v1/jobs/recordInfo:
    get:
      summary: 获取任务详情
      deprecated: false
      description: >-
        ## 概述


        使用此端点查询通过Market模型API创建的任何任务的状态和结果。这是一个统一的查询接口，适用于Market类别下的所有模型。


        ::: info[]

        适用于所有通过 POST /api/v1/jobs/createTask 创建的任务。聊天模型为同步接口，没有可查询的任务。

        :::


        ## 任务状态


        | 状态 | 描述 | 操作 |

        |-------|-------------|--------|

        | `waiting` | 任务已排队等待处理 | 继续轮询 |

        | `queuing` | 任务在处理队列中 | 继续轮询 |

        | `generating` | 任务正在处理中 | 继续轮询 |

        | `success` | 任务成功完成 | 解析`resultJson`获取结果 |

        | `fail` | 任务失败 | 查看`failCode`和`failMsg`了解详情 |


        ## 轮询最佳实践


        <AccordionGroup>

        <Accordion title="推荐的轮询间隔">
          - **初始轮询（前30秒）**: 每2-3秒
          - **30秒后**: 每5-10秒
          - **2分钟后**: 每15-30秒
          - **轮询时长**: 部分视频任务耗时超过 10 分钟，请持续轮询直至 state 为 success 或 fail。
          
        ::: tip[]
          使用指数退避来减少服务器负载和API成本。
        :::

        </Accordion>


        <Accordion title="使用回调而非轮询">
          对于生产应用，我们强烈建议在创建任务时使用`callBackUrl`参数：
          
          - **无需轮询**: 您的服务器自动接收通知
          - **降低API成本**: 消除持续的轮询请求
          - **更好的性能**: 任务完成时立即通知
          - **降低延迟**: 完成和通知之间无延迟
          
          查看各个模型文档了解回调实现详情。
        </Accordion>


        <Accordion title="处理已完成的任务">
          当`state`为`success`时：
          1. 将`resultJson`字符串解析为JSON
          2. 提取`resultUrls`数组
          3. 立即下载生成的内容
          4. 将内容存储在您自己的存储中
          
          **重要**: 生成文件保留 14 天。
        </Accordion>

        </AccordionGroup>


        ## 错误处理


        ```json 任务失败

        {
          "code": 200,
          "msg": "success",
          "data": {
            "taskId": "task_12345678",
            "model": "grok-imagine/text-to-image",
            "state": "fail",
            "param": "{\"model\":\"grok-imagine/text-to-image\",\"input\":\"{\\\"prompt\\\":\\\"...\\\"}\"}",
            "resultJson": null,
            "failCode": "400",
            "failMsg": "<error detail>",
            "completeTime": 1698765432000,
            "createTime": 1698765400000,
            "updateTime": 1698765432000
          }
        }

        ```


        ### 常见错误代码


        出错时 HTTP 状态仍为 200，请以 code 判断。


        | 代码 | 描述 | 解决方案 |

        |------|-------------|----------|

        | `401` | 未授权 - API密钥无效或缺失 | 检查您的API密钥 |

        | `422` | 缺少 taskId，或任务不存在 / 不属于当前账号 | 检查 taskId 是否正确 |

        | `500` | 内部服务器错误 | 几分钟后重试 |

        | `501` | 生成失败 | 查看`failMsg`了解具体错误详情 |


        ## 示例: 完整的轮询流程


        ```javascript Node.js

        async function pollTaskStatus(taskId, maxAttempts = 60, interval = 5000)
        {
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const response = await fetch(
              `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`,
              {
                headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
              }
            );
            
            const result = await response.json();
            if (result.code !== 200) throw new Error(result.msg);
            const { state, resultJson, failMsg } = result.data;
            
            console.log(`尝试 ${attempt + 1}: 状态 = ${state}`);
            
            if (state === 'success') {
              const results = JSON.parse(resultJson);
              console.log('✅ 任务完成!');
              console.log('结果:', results.resultUrls);
              return results;
            }
            
            if (state === 'fail') {
              console.error('❌ 任务失败:', failMsg);
              throw new Error(failMsg);
            }
            
            // 仍在处理中，等待下次轮询
            await new Promise(resolve => setTimeout(resolve, interval));
          }
          
          throw new Error('任务在最大尝试次数后超时');
        }


        // 使用方法

        try {
          const results = await pollTaskStatus('task_12345678');
          console.log('生成的内容URL:', results.resultUrls);
        } catch (error) {
          console.error('错误:', error.message);
        }

        ```


        ## 速率限制


        - **最大查询速率**: 每个API密钥每秒10次请求

        - **推荐间隔**: 轮询之间间隔2-5秒


        ::: warning[]

        过度轮询可能导致速率限制。生产应用请使用回调。

        :::


        ## 相关资源


        <CardGroup cols={2}>
          <Card title="市场概览" icon="store" href="/cn/market/quickstart">
            探索所有可用模型
          </Card>
          <Card title="获取账户积分" icon="coins" href="/cn/common-api/get-account-credits">
            查看您的剩余积分
          </Card>
        </CardGroup>
      operationId: get-task-details
      tags:
        - docs/zh-CN/Market
      parameters:
        - name: taskId
          in: query
          description: 创建任务时返回的唯一任务标识符。
          required: true
          schema:
            type: string
            examples:
              - task_12345678
      responses:
        "200":
          description: 请求成功
          content:
            application/json:
              schema:
                allOf:
                  - $ref: "#/components/schemas/ApiResponse"
                  - properties:
                      data:
                        description: 包含所有任务信息的数据对象
                        properties:
                          taskId:
                            description: 此任务的唯一标识符
                            examples:
                              - task_12345678
                            type: string
                          model:
                            description: >-
                              此任务使用的模型（例如
                              grok-imagine/text-to-image、seedream-4.0、kling-1.0）
                            examples:
                              - bytedance/seedance-2-5
                              - gpt-image-2-text-to-image
                            type: string
                          state:
                            description: 任务的当前状态。请以 state 判断任务结果。
                            enum:
                              - waiting
                              - queuing
                              - generating
                              - success
                              - fail
                            examples:
                              - success
                            type: string
                          param:
                            description: >-
                              包含创建任务时使用的原始请求参数的JSON字符串。其中的 `input` 仍是 JSON
                              字符串，需要再解析一次。
                            examples:
                              - >-
                                {"model":"grok-imagine/text-to-image","callBackUrl":"https://your-domain.com/api/callback","input":"{\"prompt\":\"电影肖像...\",\"aspect_ratio\":\"3:2\"}"}
                            type: string
                          resultJson:
                            description: >-
                              结果 JSON 字符串。state 为 success 时返回；失败时可能为 null 或空字符串。


                              结构如下：

                              - 图像/媒体/视频：{resultUrls: []}

                              - Seedance 2.x 开启 return_last_frame 时：{resultUrls:
                              [], lastFrameUrl: []}

                              - 文本类型：{resultObject: {}}


                              针对 OmniHuman 系列模型，响应说明如下：

                              - OmniHuman 1.5 Subject Detection（主体检测模型）：响应结构为
                              {resultObject: {mask_urls: ["url1", "url2",
                              ...]}}，返回检测到的主体对应的掩码图 URL 列表。该模型返回的 URL 有效期为 1 小时。

                              - OmniHuman 1.5 Human Identification（人物识别模型）：响应结构为
                              {resultObject: {subject_status: 1}}，其中
                              subject_status 含义为 0 = 不含主体，1 =
                              含主体，用于标识图片中是否检测到人物主体。
                            examples:
                              - >-
                                {"resultUrls":["https://example.com/generated-content.jpg"]}
                              - '{"resultObject":{"subject_status":1}}'
                              - >-
                                {"resultObject":{"mask_urls":["https://example.com/mask_1",
                                "https://example.com/mask_2"]}}
                            type: string
                          response:
                            type: object
                            description: resultJson 的解析结果，仅在 state 为 success 时返回。
                            x-apidog-orders: []
                            properties: {}
                            x-apidog-ignore-properties: []
                          failCode:
                            description: >-
                              失败码（数字字符串，如 "500"）。state 为 fail 时返回；成功时可能为 null
                              或空字符串。
                            examples:
                              - ""
                            type: string
                          failMsg:
                            description: 失败原因。state 为 fail 时返回；成功时可能为 null 或空字符串。
                            examples:
                              - ""
                            type: string
                          costTime:
                            description: 处理耗时（秒），成功和失败的任务都会返回。
                            examples:
                              - 15
                            format: int64
                            type: integer
                          completeTime:
                            description: 完成时间戳（Unix时间戳，毫秒）
                            examples:
                              - 1698765432000
                            format: int64
                            type: integer
                          createTime:
                            description: 创建时间戳（Unix时间戳，毫秒）
                            examples:
                              - 1698765400000
                            format: int64
                            type: integer
                          creditsConsumed:
                            description: 本次任务消耗的积分详情，表示任务执行过程中实际扣除的积分数量。
                            type: number
                        type: object
                        x-apidog-orders:
                          - taskId
                          - model
                          - state
                          - param
                          - resultJson
                          - response
                          - failCode
                          - failMsg
                          - costTime
                          - completeTime
                          - createTime
                          - creditsConsumed
                        x-apidog-ignore-properties: []
                    type: object
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
              example:
                code: 200
                msg: success
                data:
                  taskId: task_12345678
                  model: grok-imagine/text-to-image
                  state: success
                  param: >-
                    {"model":"grok-imagine/text-to-image","callBackUrl":"https://your-domain.com/api/callback","input":"{\"prompt\":\"电影肖像...\",\"aspect_ratio\":\"3:2\"}"}
                  resultJson: '{"resultUrls":["https://example.com/generated-content.jpg"]}'
                  failCode: ""
                  failMsg: ""
                  costTime: 15
                  completeTime: 1698765432000
                  createTime: 1698765400000
                  updateTime: 1698765432000
                  progress: 45
                  creditsConsumed: 50
          headers: {}
          x-apidog-name: ""
        "401":
          description: 未授权 - API密钥无效或缺失
          content:
            application/json:
              schema:
                properties:
                  code:
                    type: integer
                  msg:
                    type: string
                required:
                  - code
                  - msg
                type: object
                x-apidog-orders:
                  - code
                  - msg
                x-apidog-ignore-properties: []
              example:
                code: 401
                msg: Unauthorized
          headers: {}
          x-apidog-name: ""
        "429":
          description: 速率限制 - 请求过于频繁
          content:
            application/json:
              schema:
                properties:
                  code:
                    type: integer
                  msg:
                    type: string
                required:
                  - code
                  - msg
                type: object
                x-apidog-orders:
                  - code
                  - msg
                x-apidog-ignore-properties: []
              example:
                code: 429
                msg: Rate limit exceeded
          headers: {}
          x-apidog-name: ""
        "500":
          description: 服务器错误
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apidog-orders: []
                x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ""
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/zh-CN/Market
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506624-run
components:
  schemas:
    ApiResponse:
      type: object
      properties:
        code:
          type: integer
          description: >-
            请求状态码。请求失败时 HTTP 状态仍为 200，请始终以本字段判断：200 表示成功，其他值均表示失败，原因见
            msg。常见值：401 API key 无效或缺失；402 积分不足；429 超出频率限制；422 或 500 请求未能处理（请先查看
            msg、检查参数，再决定是否重试）。
          enum:
            - 200
            - 401
            - 402
            - 404
            - 422
            - 429
            - 433
            - 455
            - 500
            - 501
            - 505
          x-apidog-enum:
            - value: 200
              name: ""
              description: ""
            - value: 401
              name: ""
              description: ""
            - value: 402
              name: ""
              description: ""
            - value: 404
              name: ""
              description: ""
            - value: 422
              name: ""
              description: ""
            - value: 429
              name: ""
              description: ""
            - value: 433
              name: ""
              description: ""
            - value: 455
              name: ""
              description: ""
            - value: 500
              name: ""
              description: ""
            - value: 501
              name: ""
              description: ""
            - value: 505
              name: ""
              description: ""
        msg:
          type: string
          description: 响应消息，失败时的错误描述
        data:
          type: object
          properties:
            taskId:
              type: string
              description: 可以使用任务 ID 与“获取任务详细信息”端点一起查询任务状态。
          x-apidog-orders:
            - taskId
          required:
            - taskId
          x-apidog-ignore-properties: []
      x-apidog-orders:
        - code
        - msg
        - data
      required:
        - code
        - msg
        - data
      title: response not with recordId
      x-apidog-ignore-properties: []
      x-apidog-folder: ""
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: >-
        All API requests require a Bearer Token. Add the header `Authorization:
        Bearer YOUR_API_KEY` to authenticate requests.
    BearerAuth1:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: >-
        所有 API 请求都需要 Bearer Token。请在请求头中添加 `Authorization: Bearer YOUR_API_KEY`
        进行身份验证。
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []
````
