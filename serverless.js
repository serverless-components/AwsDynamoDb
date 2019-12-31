const { mergeDeepRight, pick, equals } = require('ramda')
const AWS = require('aws-sdk')
const { Component } = require('@serverless/core')
const { createTable, deleteTable, describeTable, updateTable, configChanged } = require('./utils')

const outputsList = ['name', 'arn', 'region']

const defaults = {
  attributeDefinitions: [
    {
      AttributeName: 'id',
      AttributeType: 'S'
    }
  ],
  keySchema: [
    {
      AttributeName: 'id',
      KeyType: 'HASH'
    }
  ],
  globalSecondaryIndexes: [],
  name: false,
  region: 'us-east-1'
}

const setTableName = (component, inputs) => {
  const { name, lastDeployHadNameDefined = true } = component.state
  const generatedName = inputs.name || component.context.resourceId()

  // Name considered not changed if previous deploy did not define a name
  // and neither did this deploy
  return !lastDeployHadNameDefined && !inputs.name ? name : generatedName
}

class AwsDynamoDb extends Component {
  async default(inputs = {}) {
    this.context.status('Deploying')
    const config = mergeDeepRight(defaults, inputs)

    this.context.debug(
      `Starting deployment of table ${config.name} in the ${config.region} region.`
    )

    const dynamodb = new AWS.DynamoDB({
      region: config.region,
      credentials: this.context.credentials.aws
    })

    this.context.debug(
      `Checking if table ${config.name} already exists in the ${config.region} region.`
    )

    config.name = setTableName(this, inputs)

    const prevTable = await describeTable({ dynamodb, name: this.state.name })

    if (!prevTable) {
      this.context.status('Creating')
      this.context.debug(`Table ${config.name} does not exist. Creating...`)

      config.arn = await createTable({ dynamodb, ...config })
    } else {
      this.context.debug(`Table ${config.name} already exists. Comparing config changes...`)

      config.arn = prevTable.arn

      if (configChanged(prevTable, config)) {
        this.context.status('Updating')
        this.context.debug(`Config changed for table ${config.name}. Updating...`)

        if (!equals(prevTable.name, config.name)) {
          // If "delete: false", don't delete the table
          if (config.delete === false) {
            throw new Error(
              `You're attempting to change your table name from ${this.state.name} to ${config.name} which will result in you deleting your table, but you've specified the "delete" input to "false" which prevents your original table from being deleted.`
            )
          }
          await deleteTable({ dynamodb, name: prevTable.name })
          config.arn = await createTable({ dynamodb, ...config })
        } else {
          const prevGlobalSecondaryIndexes = prevTable.globalSecondaryIndexes || []
          await updateTable.call(this, { dynamodb, prevGlobalSecondaryIndexes, ...config })
        }
      }
    }

    this.context.debug(
      `Table ${config.name} was successfully deployed to the ${config.region} region.`
    )

    this.state.lastDeployHadNameDefined = Boolean(inputs.name)
    this.state.arn = config.arn
    this.state.name = config.name
    this.state.region = config.region
    this.state.delete = config.delete === false ? config.delete : true
    await this.save()

    const outputs = pick(outputsList, config)

    return outputs
  }

  async remove() {
    this.context.status('Removing')

    // If "delete: false", don't delete the table, and warn instead
    if (this.state.delete === false) {
      this.context.debug(`Skipping table removal because "delete" is set to "false".`)
      return {}
    }

    const { name, region } = this.state

    if (!name) {
      this.context.debug(`Aborting removal. Table name not found in state.`)
      return
    }

    const dynamodb = new AWS.DynamoDB({
      region,
      credentials: this.context.credentials.aws
    })

    this.context.debug(`Removing table ${name} from the ${region} region.`)

    await deleteTable({ dynamodb, name })

    const outputs = pick(outputsList, this.state)

    this.context.debug(`Table ${name} was successfully removed from the ${region} region.`)

    this.state = {}
    await this.save()

    return outputs
  }
}

module.exports = AwsDynamoDb
