const { not, equals, pick } = require('ramda')

async function createTable({ dynamodb, name, attributeDefinitions, keySchema }) {
  const res = await dynamodb
    .createTable({
      TableName: name,
      AttributeDefinitions: attributeDefinitions,
      KeySchema: keySchema,
      BillingMode: 'PAY_PER_REQUEST'
    })
    .promise()
  return res.TableDescription.TableArn
}

async function describeTable({ dynamodb, name }) {
  let res

  try {
    const data = await dynamodb.describeTable({ TableName: name }).promise()
    res = {
      arn: data.Table.TableArn,
      name: data.Table.TableName,
      attributeDefinitions: data.Table.AttributeDefinitions,
      keySchema: data.Table.KeySchema
    }
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      res = null
    }
  } finally {
    return res
  }
}

async function updateTable({ dynamodb, name, attributeDefinitions }) {
  const res = await dynamodb
    .updateTable({
      TableName: name,
      AttributeDefinitions: attributeDefinitions,
      BillingMode: 'PAY_PER_REQUEST'
    })
    .promise()
  return res.TableDescription.TableArn
}

async function deleteTable({ dynamodb, name }) {
  let res = false
  try {
    res = await dynamodb
      .deleteTable({
        TableName: name
      })
      .promise()
  } catch (error) {
    if (error.code !== 'ResourceNotFoundException') {
      throw error
    }
  }
  return !!res
}

function configChanged(prevTable, table) {
  const prevInputs = pick(['name', 'attributeDefinitions'], prevTable)
  const inputs = pick(['name', 'attributeDefinitions'], table)

  return not(equals(inputs, prevInputs))
}

module.exports = {
  createTable,
  describeTable,
  updateTable,
  deleteTable,
  configChanged
}
