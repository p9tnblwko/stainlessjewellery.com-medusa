import {
  AbstractPaymentProvider,
  BigNumber,
  MedusaError,
  PaymentActions,
} from '@medusajs/framework/utils'
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  PaymentSessionStatus,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from '@medusajs/framework/types'
import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  OrderApplicationContextLandingPage,
  OrderApplicationContextUserAction,
  OrderRequest,
  OrderStatus,
  OrdersController,
  PatchOp,
  PaymentsController,
} from '@paypal/paypal-server-sdk'

type Options = {
  client_id: string
  client_secret: string
  environment?: 'sandbox' | 'production'
  autoCapture?: boolean
  webhook_id?: string
}

type InjectedDependencies = {
  logger: Logger
}

class PayPalPaymentProviderService extends AbstractPaymentProvider<Options> {
  static identifier = 'paypal'

  protected logger_: Logger
  protected options_: Options
  protected client_: Client
  protected ordersController_: OrdersController
  protected paymentsController_: PaymentsController

  constructor(container: InjectedDependencies, options: Options) {
    super(container, options)

    console.log("PayPalPaymentProviderService");
    console.log(options);

    this.logger_ = container.logger
    this.options_ = {
      environment: 'sandbox',
      autoCapture: false,
      ...options,
    }

    this.client_ = new Client({
      environment:
        this.options_.environment === 'production'
          ? Environment.Production
          : Environment.Sandbox,
      clientCredentialsAuthCredentials: {
        oAuthClientId: this.options_.client_id,
        oAuthClientSecret: this.options_.client_secret,
      },
    })

    this.ordersController_ = new OrdersController(this.client_)
    this.paymentsController_ = new PaymentsController(this.client_)
  }

  static validateOptions(options: Record<any, any>): void | never {
    if (!options.client_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        'Client ID is required'
      )
    }

    if (!options.client_secret) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        'Client secret is required'
      )
    }
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    try {
      const { amount, currency_code } = input

      const intent = this.options_.autoCapture
        ? CheckoutPaymentIntent.Capture
        : CheckoutPaymentIntent.Authorize

      const orderRequest: OrderRequest = {
        intent,
        purchaseUnits: [
          {
            amount: {
              currencyCode: currency_code.toUpperCase(),
              value: amount.toString(),
            },
            description: 'Order payment',
            customId: input.data?.session_id as string | undefined,
            referenceId: 'default',
          },
        ],
        applicationContext: {
          brandName: 'Store',
          landingPage: OrderApplicationContextLandingPage.NoPreference,
          userAction: OrderApplicationContextUserAction.PayNow,
        },
      }

      const response = await this.ordersController_.createOrder({
        body: orderRequest,
        prefer: 'return=representation',
      })

      const order = response.result

      if (!order?.id) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          'Failed to create PayPal order'
        )
      }

      const approvalUrl = order.links?.find((link) => link.rel === 'approve')
        ?.href

      return {
        id: order.id,
        data: {
          order_id: order.id,
          intent,
          status: order.status,
          approval_url: approvalUrl,
          session_id: input.data?.session_id,
          currency_code,
        },
      }
    } catch (error: any) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to initiate PayPal payment: ${error.result?.message || error}`
      )
    }
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    try {
      const orderId = input.data?.order_id as string | undefined

      if (!orderId || typeof orderId !== 'string') {
        return {
          status: 'error',
          data: input.data,
        }
      }

      const response = this.options_.autoCapture
        ? await this.ordersController_.captureOrder({
            id: orderId,
            prefer: 'return=representation',
          })
        : await this.ordersController_.authorizeOrder({
            id: orderId,
            prefer: 'return=representation',
          })

      const order = response.result

      if (!order?.id) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          'Failed to authorize PayPal order'
        )
      }

      const authorization =
        order.purchaseUnits?.[0]?.payments?.authorizations?.[0]
      const capture = order.purchaseUnits?.[0]?.payments?.captures?.[0]
      const authorizationStatus = this.options_.autoCapture
        ? capture?.status
        : authorization?.status

      return {
        status:
          authorizationStatus === 'COMPLETED' ||
          authorizationStatus === 'CREATED'
            ? ('authorized' as PaymentSessionStatus)
            : ('pending' as PaymentSessionStatus),
        data: {
          ...input.data,
          order_id: order.id,
          status: order.status,
          authorization_id: authorization?.id,
          capture_id: capture?.id,
        },
      }
    } catch (error: any) {
      return {
        status: 'error',
        data: {
          ...input.data,
          error: error.result?.message || error.message || String(error),
        },
      }
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    try {
      const authorizationId = input.data?.authorization_id as string | undefined

      if (!authorizationId || typeof authorizationId !== 'string') {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          'PayPal authorization ID is required for capture'
        )
      }

      const response = await this.paymentsController_.captureAuthorizedPayment({
        authorizationId,
        prefer: 'return=representation',
      })

      const capture = response.result

      if (!capture?.id) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          'Failed to capture PayPal payment'
        )
      }

      return {
        data: {
          ...input.data,
          capture_id: capture.id,
        },
      }
    } catch (error: any) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to capture PayPal payment: ${error.result?.message || error}`
      )
    }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    try {
      const captureId = input.data?.capture_id as string | undefined

      if (!captureId || typeof captureId !== 'string') {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          'PayPal capture ID is required for refund'
        )
      }

      const refundRequest = {
        amount: {
          currencyCode:
            (input.data?.currency_code as string | undefined)?.toUpperCase() || '',
          value: new BigNumber(input.amount).numeric.toString(),
        },
      }

      const response = await this.paymentsController_.refundCapturedPayment({
        captureId,
        body: Object.keys(refundRequest).length > 0 ? refundRequest : undefined,
        prefer: 'return=representation',
      })

      const refund = response.result

      if (!refund?.id) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          'Failed to refund PayPal payment'
        )
      }

      return {
        data: {
          ...input.data,
          refund_id: refund.id,
        },
      }
    } catch (error: any) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to refund PayPal payment: ${error.result?.message || error}`
      )
    }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<UpdatePaymentOutput> {
    try {
      const orderId = input.data?.order_id as string | undefined

      if (!orderId) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          'PayPal order ID is required'
        )
      }

      await this.ordersController_.patchOrder({
        id: orderId,
        body: [
          {
            op: PatchOp.Replace,
            path: "/purchase_units/@reference_id=='default'/amount/value",
            value: new BigNumber(input.amount).numeric.toString(),
          },
        ],
      })

      return {
        data: {
          ...input.data,
          currency_code: input.currency_code,
        },
      }
    } catch (error: any) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to update PayPal payment: ${error.result?.message || error}`
      )
    }
  }

  async deletePayment(
    input: DeletePaymentInput
  ): Promise<DeletePaymentOutput> {
    return {
      data: input.data,
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    try {
      const orderId = input.data?.order_id as string | undefined

      if (!orderId || typeof orderId !== 'string') {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          'PayPal order ID is required'
        )
      }

      const response = await this.ordersController_.getOrder({
        id: orderId,
      })

      const order = response.result

      if (!order?.id) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          'PayPal order not found'
        )
      }

      return {
        data: {
          order_id: order.id,
          status: order.status,
          intent: order.intent,
        },
      }
    } catch (error: any) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to retrieve PayPal payment: ${error.result?.message || error}`
      )
    }
  }

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    try {
      const authorizationId = input.data?.authorization_id as string | undefined

      if (!authorizationId || typeof authorizationId !== 'string') {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          'PayPal authorization ID is required for cancellation'
        )
      }

      await this.paymentsController_.voidPayment({
        authorizationId,
      })

      return {
        data: input.data,
      }
    } catch (error: any) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Failed to cancel PayPal payment: ${error.result?.message || error}`
      )
    }
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    try {
      const orderId = input.data?.order_id as string | undefined

      if (!orderId || typeof orderId !== 'string') {
        return { status: 'pending' as PaymentSessionStatus }
      }

      const response = await this.ordersController_.getOrder({
        id: orderId,
      })

      const order = response.result

      if (!order) {
        return { status: 'pending' as PaymentSessionStatus }
      }

      switch (order.status) {
        case OrderStatus.Created:
        case OrderStatus.Saved:
          return { status: 'pending' as PaymentSessionStatus }
        case OrderStatus.Approved:
        case OrderStatus.Completed:
          return { status: 'authorized' as PaymentSessionStatus }
        case OrderStatus.Voided:
          return { status: 'canceled' as PaymentSessionStatus }
        default:
          return { status: 'pending' as PaymentSessionStatus }
      }
    } catch {
      return { status: 'pending' as PaymentSessionStatus }
    }
  }

  private async verifyWebhookSignature(
    headers: Record<string, any>,
    body: any,
    rawBody: string | Buffer | undefined
  ): Promise<boolean> {
    try {
      if (!this.options_.webhook_id) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          'PayPal webhook ID is required for webhook signature verification'
        )
      }

      const transmissionId = headers['paypal-transmission-id']
      const transmissionTime = headers['paypal-transmission-time']
      const certUrl = headers['paypal-cert-url']
      const authAlgo = headers['paypal-auth-algo']
      const transmissionSig = headers['paypal-transmission-sig']

      if (
        !transmissionId ||
        !transmissionTime ||
        !certUrl ||
        !authAlgo ||
        !transmissionSig
      ) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          'Missing required PayPal webhook headers'
        )
      }

      const baseUrl =
        this.options_.environment === 'production'
          ? 'https://api.paypal.com'
          : 'https://api.sandbox.paypal.com'

      const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${this.options_.client_id}:${this.options_.client_secret}`
          ).toString('base64')}`,
        },
        body: 'grant_type=client_credentials',
      })

      if (!authResponse.ok) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          'Failed to get access token for webhook verification'
        )
      }

      const authData = await authResponse.json()
      const accessToken = authData.access_token

      if (!accessToken) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          'Access token not received from PayPal'
        )
      }

      let webhookEvent: any

      if (rawBody) {
        const rawBodyString =
          typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')

        try {
          webhookEvent = JSON.parse(rawBodyString)
        } catch {
          this.logger_.warn('Raw body is not valid JSON, using parsed body')
          webhookEvent = body
        }
      } else {
        this.logger_.warn(
          'Raw body not available, using parsed body. Verification may fail if formatting differs.'
        )
        webhookEvent = body
      }

      const verifyResponse = await fetch(
        `${baseUrl}/v1/notifications/verify-webhook-signature`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            transmission_id: transmissionId,
            transmission_time: transmissionTime,
            cert_url: certUrl,
            auth_algo: authAlgo,
            transmission_sig: transmissionSig,
            webhook_id: this.options_.webhook_id,
            webhook_event: webhookEvent,
          }),
        }
      )

      if (!verifyResponse.ok) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          'Webhook verification API call failed'
        )
      }

      const verifyData = await verifyResponse.json()
      const isValid = verifyData.verification_status === 'SUCCESS'

      if (!isValid) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          'Webhook signature verification failed'
        )
      }

      return isValid
    } catch (error) {
      this.logger_.error('PayPal verifyWebhookSignature error:', error)
      return false
    }
  }

  async getWebhookActionAndData(
    payload: ProviderWebhookPayload['payload']
  ): Promise<WebhookActionResult> {
    try {
      const { data, rawData, headers } = payload

      const isValid = await this.verifyWebhookSignature(
        headers || {},
        data,
        rawData || ''
      )

      if (!isValid) {
        this.logger_.error('Invalid PayPal webhook signature')
        return {
          action: 'failed',
          data: {
            session_id: '',
            amount: new BigNumber(0),
          },
        }
      }

      const eventType = (data as any)?.event_type

      if (!eventType) {
        this.logger_.warn('PayPal webhook event missing event_type')
        return {
          action: 'not_supported',
          data: {
            session_id: '',
            amount: new BigNumber(0),
          },
        }
      }

      const resource = (data as any)?.resource
      const sessionId =
        (data as any)?.resource?.custom_id ||
        resource?.purchase_units?.[0]?.custom_id

      if (!sessionId) {
        this.logger_.warn('Session ID not found in PayPal webhook resource')
        return {
          action: 'not_supported',
          data: {
            session_id: '',
            amount: new BigNumber(0),
          },
        }
      }

      const amountValue =
        resource?.amount?.value ||
        resource?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ||
        resource?.purchase_units?.[0]?.payments?.authorizations?.[0]?.amount?.value ||
        0

      const payloadData = {
        session_id: sessionId,
        amount: new BigNumber(amountValue),
      }

      switch (eventType) {
        case 'PAYMENT.AUTHORIZATION.CREATED':
          return {
            action: PaymentActions.AUTHORIZED,
            data: payloadData,
          }
        case 'PAYMENT.CAPTURE.DENIED':
          return {
            action: PaymentActions.FAILED,
            data: payloadData,
          }
        case 'PAYMENT.AUTHORIZATION.VOIDED':
          return {
            action: PaymentActions.CANCELED,
            data: payloadData,
          }
        case 'PAYMENT.CAPTURE.COMPLETED':
          return {
            action: PaymentActions.SUCCESSFUL,
            data: payloadData,
          }
        default:
          this.logger_.info(`Unhandled PayPal webhook event: ${eventType}`)
          return {
            action: PaymentActions.NOT_SUPPORTED,
            data: payloadData,
          }
      }
    } catch (error: any) {
      this.logger_.error(
        'PayPal getWebhookActionAndData error:',
        error.result?.message || error
      )

      return {
        action: 'failed',
        data: {
          session_id: '',
          amount: new BigNumber(0),
        },
      }
    }
  }
}

export default PayPalPaymentProviderService
